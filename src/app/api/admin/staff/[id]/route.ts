import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  role: z.enum(["CUSTOMER", "STAFF", "SUPERVISOR", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "REVIEW", "CLOSED"]).optional(),
  email: z.string().email().max(255).nullable().optional(),
  name: z.string().min(1).max(255).optional(),
});

// Update an existing account: tag/promote a customer to STAFF, suspend a
// pilot account, fix an email so OTP delivery works, etc.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const patch = parsed.data;

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // OWNER accounts cannot be demoted/edited from this page — do that in the DB directly.
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot modify an OWNER account here" }, { status: 403 });
  }

  // Only OWNER can grant/revoke ADMIN.
  if ((patch.role === "ADMIN" || target.role === "ADMIN") && actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only an OWNER can change an ADMIN account" }, { status: 403 });
  }

  const [updated] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "STAFF_UPDATE",
    entity: "users",
    entityId: id,
    before: target,
    after: updated,
    reason: `Updated by ${actor.customerId} via /admin/staff`,
  });

  return NextResponse.json({ user: updated });
}
