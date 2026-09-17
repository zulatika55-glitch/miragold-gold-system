import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { checkOtp, consumeOtp } from "@/lib/otp";
import { createSession } from "@/lib/auth";
import { newCustomerId } from "@/lib/refs";
import { writeAuditLog } from "@/lib/audit";
import { normalizeMyPhone, phoneLookupCandidates } from "@/lib/phone";

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().length(6),
  name: z.string().min(1).max(255).optional(), // required on first-time registration
  email: z.string().email().max(255).optional(), // required on first-time registration
});

// Module 02 — verifies OTP, creates the customer on first login (spec:
// "Customer ID unik diwujudkan semasa registration"), then starts a session.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { code, name, email } = parsed.data;
  const phone = normalizeMyPhone(parsed.data.phone);

  // Check without consuming yet — a brand-new number needs a second
  // round-trip (this same code, plus name+email) before the code is
  // actually spent, so a first-time registration doesn't burn the code on
  // step one. checkOtp() is looked up against the SAME normalized phone
  // requestOtp() stored the code under.
  const { ok, otpId } = await checkOtp(phone, code);
  if (!ok || !otpId) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 401 });
  }

  let [user] = await db
    .select()
    .from(users)
    .where(inArray(users.phone, phoneLookupCandidates(parsed.data.phone)))
    .limit(1);

  if (!user) {
    // OTP_PROVIDER=resend has no other way to deliver a code, so an email
    // is required for every brand-new registration, not just a name.
    if (!name || !email) {
      return NextResponse.json(
        {
          error: "NEW_ACCOUNT_NEEDS_DETAILS",
          message: "Nombor baharu — sila lengkapkan nama dan email untuk daftar (guna \"Daftar Akaun Baharu\").",
        },
        { status: 422 },
      );
    }

    [user] = await db
      .insert(users)
      .values({
        customerId: newCustomerId(),
        name,
        phone,
        email,
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
    // Still consume the code — it was correct, so it shouldn't remain
    // usable for a second attempt just because the account is blocked.
    await consumeOtp(otpId);
    return NextResponse.json({ error: `Account is ${user.status}. Contact Miragold support.` }, { status: 403 });
  }

  await consumeOtp(otpId);
  await createSession(user.id, user.customerId, user.role);

  return NextResponse.json({
    ok: true,
    user: { customerId: user.customerId, name: user.name, phone: user.phone, role: user.role },
  });
}
