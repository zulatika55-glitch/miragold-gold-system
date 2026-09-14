import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyOtp } from "@/lib/otp";
import { createSession } from "@/lib/auth";
import { newCustomerId } from "@/lib/refs";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().length(6),
  name: z.string().min(1).max(255).optional(), // required on first-time registration
});

// Module 02 — verifies OTP, creates the customer on first login (spec:
// "Customer ID unik diwujudkan semasa registration"), then starts a session.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { phone, code, name } = parsed.data;

  const ok = await verifyOtp(phone, code);
  if (!ok) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 401 });
  }

  let [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

  if (!user) {
    if (!name) {
      return NextResponse.json({ error: "New number — please provide `name` to complete registration" }, { status: 422 });
    }

    [user] = await db
      .insert(users)
      .values({
        customerId: newCustomerId(),
        name,
        phone,
        role: "CUSTOMER",
        status: "ACTIVE",
      })
      .returning();

    await writeAuditLog(db, {
      actorId: user.id,
      actorType: "CUSTOMER",
      action: "REGISTER",
      entity: "users",
      entityId: user.id,
      after: user,
    });
  }

  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: `Account is ${user.status}. Contact Miragold support.` }, { status: 403 });
  }

  await createSession(user.id, user.customerId, user.role);

  return NextResponse.json({
    ok: true,
    user: { customerId: user.customerId, name: user.name, phone: user.phone, role: user.role },
  });
}
