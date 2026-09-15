import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtp } from "@/lib/otp";

const bodySchema = z.object({
  phone: z.string().min(8).max(20).regex(/^\+?[0-9]+$/, "Phone must contain only digits (optionally with a leading +)"),
});

// Module 02 — public-ready login: phone number + OTP.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { expiresAt } = await requestOtp(parsed.data.phone);

  return NextResponse.json({ ok: true, expiresAt });
}
