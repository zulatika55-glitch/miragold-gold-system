import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { requestOtp } from "@/lib/otp";
import { phoneLookupCandidates } from "@/lib/phone";

const bodySchema = z.object({
  phone: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+?[0-9]+$/, "Phone must contain only digits (optionally with a leading +)"),
  // Required for a brand-new number (sign-up flow) so the very first OTP
  // has somewhere to go — OTP_PROVIDER=resend has no way to email a phone
  // number that has never registered before.
  email: z.string().email().max(255).optional(),
});

// Module 02 — public-ready login: phone number + OTP. Also doubles as the
// first step of sign-up when `email` is supplied for a new number.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { phone, email } = parsed.data;

  const [existing] = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.phone, phoneLookupCandidates(phone)))
    .limit(1);

  if (!existing && !email && (process.env.OTP_PROVIDER ?? "mock") === "resend") {
    return NextResponse.json(
      {
        error:
          "Nombor ini belum berdaftar. Sila guna \"Daftar Akaun Baharu\" dan isikan email anda supaya kod OTP boleh dihantar.",
      },
      { status: 422 },
    );
  }

  try {
    const { expiresAt } = await requestOtp(phone, email);
    return NextResponse.json({ ok: true, expiresAt });
  } catch (err) {
    // Never let an OTP-delivery failure crash into an empty/HTML 500 —
    // the client always expects JSON back here. Log the real cause
    // server-side (e.g. Resend sandbox-mode rejection) and surface a
    // friendly, actionable message to the customer.
    console.error("[request-otp] failed to send OTP:", err);
    const detail = err instanceof Error ? err.message : String(err);
    const isResendSandboxLimit = detail.includes("You can only send testing emails to your own email address");

    return NextResponse.json(
      {
        error: isResendSandboxLimit
          ? "Sistem emel OTP masih dalam mod ujian dan belum boleh hantar ke email pelanggan lain. Sila hubungi Miragold."
          : "Kod OTP tidak dapat dihantar buat masa ini. Sila cuba lagi sebentar.",
      },
      { status: 502 },
    );
  }
}
