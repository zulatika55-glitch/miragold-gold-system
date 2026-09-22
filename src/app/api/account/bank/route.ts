import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { requestOtp, verifyOtp } from "@/lib/otp";
import { writeAuditLog } from "@/lib/audit";

// Fasa 2A spec section 9: "Perubahan bank details perlu ada
// verification/security control." — bank details can only be changed with
// a fresh OTP, the same mechanism used for login (Module 02), sent to the
// customer's own phone/email on file (never to whatever the customer just
// typed in the form).
function bankNameMatches(accountHolderName: string | null, walletName: string): boolean {
  if (!accountHolderName) return false;
  return accountHolderName.trim().toLowerCase() === walletName.trim().toLowerCase();
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  return NextResponse.json({
    bank: {
      bankName: user.bankName,
      bankAccountNumber: user.bankAccountNumber,
      bankAccountHolderName: user.bankAccountHolderName,
      bankDetailsUpdatedAt: user.bankDetailsUpdatedAt,
      // So the UI can warn the customer BEFORE they try to sell, rather
      // than only discovering the block on the Jual Emas screen.
      nameMatches: bankNameMatches(user.bankAccountHolderName, user.name),
    },
  });
}

const requestOtpBodySchema = z.object({ action: z.literal("REQUEST_OTP") });

const updateBodySchema = z.object({
  bankName: z.string().min(2).max(128),
  bankAccountNumber: z.string().min(4).max(64),
  bankAccountHolderName: z.string().min(2).max(255),
  otpCode: z.string().length(6),
});

// POST is split by an `action` discriminator instead of a separate route
// file so the two steps (send OTP, then confirm+save) share this one small
// handler — there is no state to persist between them beyond the OTP
// record itself, which otpCodes already tracks by phone.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: `Account is ${user.status}` }, { status: 403 });
  }

  const raw = await req.json();

  const otpRequest = requestOtpBodySchema.safeParse(raw);
  if (otpRequest.success) {
    try {
      const { expiresAt } = await requestOtp(user.phone);
      return NextResponse.json({ ok: true, expiresAt });
    } catch (err) {
      console.error("[account/bank] failed to send OTP:", err);
      return NextResponse.json({ error: "Kod OTP tidak dapat dihantar buat masa ini. Sila cuba lagi." }, { status: 502 });
    }
  }

  const parsed = updateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { bankName, bankAccountNumber, bankAccountHolderName, otpCode } = parsed.data;

  const otpOk = await verifyOtp(user.phone, otpCode);
  if (!otpOk) {
    return NextResponse.json({ error: "Kod OTP tidak sah atau telah luput" }, { status: 401 });
  }

  const before = {
    bankName: user.bankName,
    bankAccountNumber: user.bankAccountNumber,
    bankAccountHolderName: user.bankAccountHolderName,
  };

  const [updated] = await db
    .update(users)
    .set({
      bankName,
      bankAccountNumber,
      bankAccountHolderName,
      bankDetailsUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  await writeAuditLog(db, {
    actorId: user.id,
    actorType: user.role as "CUSTOMER" | "STAFF" | "SUPERVISOR" | "ADMIN" | "OWNER",
    action: "BANK_DETAILS_UPDATED",
    entity: "users",
    entityId: user.id,
    before,
    after: { bankName, bankAccountNumber, bankAccountHolderName },
    reason: "Customer self-service bank detail update, OTP-verified",
  });

  return NextResponse.json({
    ok: true,
    bank: {
      bankName: updated.bankName,
      bankAccountNumber: updated.bankAccountNumber,
      bankAccountHolderName: updated.bankAccountHolderName,
      bankDetailsUpdatedAt: updated.bankDetailsUpdatedAt,
      nameMatches: bankNameMatches(updated.bankAccountHolderName, updated.name),
    },
  });
}
