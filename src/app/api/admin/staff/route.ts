import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, eq, ilike, or } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { newCustomerId } from "@/lib/refs";
import { writeAuditLog } from "@/lib/audit";

// Staff are just `users` rows tagged with a STAFF+ role (spec 5.1: "internal
// STAFF/PILOT tag ... never a separate employee login"). This page lets an
// ADMIN/OWNER provision and manage those accounts for the Fasa 2 pilot
// without needing a raw SQL console.

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminOrAbove(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const rows = await db
    .select({
      id: users.id,
      customerId: users.customerId,
      name: users.name,
      phone: users.phone,
      email: users.email,
      role: users.role,
      status: users.status,
      tags: users.tags,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      q
        ? or(
            ilike(users.name, `%${q}%`),
            ilike(users.phone, `%${q}%`),
            ilike(users.customerId, `%${q}%`),
            ilike(users.email, `%${q}%`),
          )
        : undefined,
    )
    .orderBy(desc(users.createdAt))
    .limit(200);

  return NextResponse.json({ users: rows });
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+?[0-9]+$/, "Phone must contain only digits (optionally with a leading +)"),
  email: z.string().email().max(255),
  role: z.enum(["STAFF", "SUPERVISOR", "ADMIN"]),
});

// Provision a new staff/pilot account. They log in the same way a customer
// does (phone + OTP) — this just pre-creates the row with a role above
// CUSTOMER and an email on file, so OTP_PROVIDER=resend has somewhere to
// deliver the code.
export async function POST(req: Request) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, phone, email, role } = parsed.data;

  // Only OWNER can grant ADMIN — a plain ADMIN cannot mint more admins.
  if (role === "ADMIN" && actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only an OWNER can assign the ADMIN role" }, { status: 403 });
  }

  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "A user with this phone number already exists" }, { status: 409 });
  }

  const [created] = await db
    .insert(users)
    .values({
      customerId: newCustomerId(),
      name,
      phone,
      email,
      role,
      status: "ACTIVE",
      tags: ["PILOT"],
    })
    .returning();

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "STAFF_CREATE",
    entity: "users",
    entityId: created.id,
    after: created,
    reason: `Provisioned by ${actor.customerId} via /admin/staff`,
  });

  return NextResponse.json({ user: created });
}
