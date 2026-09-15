import crypto from "crypto";
import { db } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

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

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OTP_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY / OTP_FROM_EMAIL not set. Required when OTP_PROVIDER=resend.");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Miragold <${from}>`,
      to: [email],
      subject: `Kod OTP Miragold: ${code}`,
      html: `<p>Kod OTP anda: <strong style="font-size:20px">${code}</strong></p><p>Kod ini luput dalam ${OTP_TTL_MINUTES} minit. Jangan kongsi kod ini dengan sesiapa.</p>`,
      text: `Kod OTP anda: ${code} (luput dalam ${OTP_TTL_MINUTES} minit). Jangan kongsi kod ini dengan sesiapa.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

async function sendOtp(phone: string, code: string, email: string | null): Promise<void> {
  const provider = process.env.OTP_PROVIDER ?? "mock";

  if (provider === "mock") {
    console.log(`[OTP MOCK] Sending OTP ${code} to ${phone} (expires in ${OTP_TTL_MINUTES}m)`);
    return;
  }

  if (provider === "resend") {
    if (!email) {
      throw new Error(
        "No email on file for this account, so an OTP email cannot be sent. Ask an admin to add one via /admin/staff.",
      );
    }
    await sendOtpEmail(email, code);
    return;
  }

  if (provider === "twilio") {
    throw new Error("Twilio OTP provider not yet configured. Set TWILIO_* env vars and implement sendOtp().");
  }

  throw new Error(`Unknown OTP_PROVIDER: ${provider}`);
}

export async function requestOtp(phone: string): Promise<{ expiresAt: Date }> {
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

  await db.insert(otpCodes).values({
    phone,
    codeHash,
    expiresAt,
  });

  await sendOtp(phone, code, existing?.email ?? null);

  return { expiresAt };
}

export async function checkOtp(phone: string, code: string): Promise<{ ok: boolean; otpId?: string }> {
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
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!record) return { ok: false };
  if (Number(record.attempts) >= MAX_ATTEMPTS) return { ok: false };

  if (record.codeHash !== codeHash) {
    await db
      .update(otpCodes)
      .set({ attempts: String(Number(record.attempts) + 1) })
      .where(eq(otpCodes.id, record.id));
    return { ok: false };
  }

  return { ok: true, otpId: record.id };
}

export async function consumeOtp(otpId: string): Promise<void> {
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otpId));
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const result = await checkOtp(phone, code);
  if (!result.ok || !result.otpId) return false;
  await consumeOtp(result.otpId);
  return true;
}
