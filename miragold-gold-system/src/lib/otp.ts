import crypto from "crypto";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";

/**
 * OTP delivery is behind this single interface so a real SMS provider
 * (Twilio, a local Malaysian gateway, etc.) can be swapped in later by
 * only changing `sendOtpSms` below — nothing else in the app needs to
 * change. OTP_PROVIDER=mock (the default) logs the code to the server
 * console instead of sending a real SMS, which costs nothing and is fine
 * for development and the Fasa 2 staff pilot.
 */

const OTP_TTL_MINUTES = 5;
const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  const max = 10 ** OTP_LENGTH;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(OTP_LENGTH, "0");
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

async function sendOtpSms(phone: string, code: string): Promise<void> {
  const provider = process.env.OTP_PROVIDER ?? "mock";

  if (provider === "mock") {
    console.log(`[OTP MOCK] Sending OTP ${code} to ${phone} (expires in ${OTP_TTL_MINUTES}m)`);
    return;
  }

  if (provider === "twilio") {
    // Placeholder for a real Twilio integration:
    // const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ to: phone, from: process.env.TWILIO_FROM, body: `Miragold OTP: ${code}` });
    throw new Error("Twilio OTP provider not yet configured. Set TWILIO_* env vars and implement sendOtpSms().");
  }

  throw new Error(`Unknown OTP_PROVIDER: ${provider}`);
}

export async function requestOtp(phone: string): Promise<{ expiresAt: Date }> {
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await db.insert(otpCodes).values({
    phone,
    codeHash,
    expiresAt,
  });

  await sendOtpSms(phone, code);

  return { expiresAt };
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const codeHash = hashCode(code);

  const [record] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.phone, phone),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(otpCodes.createdAt)
    .limit(1);

  if (!record) return false;
  if (Number(record.attempts) >= MAX_ATTEMPTS) return false;

  if (record.codeHash !== codeHash) {
    await db
      .update(otpCodes)
      .set({ attempts: String(Number(record.attempts) + 1) })
      .where(eq(otpCodes.id, record.id));
    return false;
  }

  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, record.id));
  return true;
}
