import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { verifyOtp } from "@/lib/otp";
import { writeAuditLog } from "@/lib/audit";
import { formatGram, formatRm } from "@/lib/decimal";
import { computeRedemptionAmounts, REDEMPTION_PAYMENT_EXPIRY_MINUTES } from "@/lib/redemption";
import { createBill } from "@/lib/billplz";

const bodySchema = z.object({ otpCode: z.string().length(6) });

// Spec section 9-13: OTP verification for a sensitive transaction. The gram
// has already been on hold since request-otp (PENDING_CONFIRMATION counts as
// an active hold — see REDEMPTION_ACTIVE_HOLD_STATUSES in wallet.ts), so this
// step never moves gram itself. It only decides which of two paths the
// redemption takes next: if there's an RM shortfall, create a Billplz bill
// and move to AWAITING_PAYMENT; if the wallet fully covers the item (spec
// 13's RM0 case), skip payment entirely and go straight to PROCESSING.
export async function POST(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { redemptionRef } = await params;
  const [row] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!row || row.customerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== "PENDING_CONFIRMATION") {
    return NextResponse.json({ error: `Redemption ini sudah pada status ${row.status}` }, { status: 409 });
  }
  if (!row.otpExpiresAt || row.otpExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Tempoh OTP telah tamat. Sila mula semula pengesahan." }, { status: 410 });
  }

  const otpOk = await verifyOtp(user.phone, parsed.data.otpCode);
  if (!otpOk) {
    return NextResponse.json({ error: "Kod OTP tidak sah atau telah luput" }, { status: 401 });
  }

  const { totalPaymentRm } = computeRedemptionAmounts(row);

  if (totalPaymentRm.gt(0)) {
    const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    let bill;
    try {
      bill = await createBill({
        amountSen: Math.round(totalPaymentRm.toNumber() * 100),
        name: user.name,
        email: user.email ?? undefined,
        mobile: user.phone,
        description: `Miragold Gold Wallet - Tebus Barang Kemas (${row.redemptionRef})`,
        reference1Label: "Redemption Ref",
        reference1: row.redemptionRef,
        callbackUrl: `${appBaseUrl}/api/payments/billplz/webhook`,
        redirectUrl: `${appBaseUrl}/api/payments/billplz/redirect?redemption=${row.redemptionRef}`,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Kod OTP sah, tetapi pembayaran tidak dapat dimulakan buat masa ini: ${err instanceof Error ? err.message : String(err)}. Sila hubungi Miragold.` },
        { status: 502 },
      );
    }

    const paymentExpiresAt = new Date(Date.now() + REDEMPTION_PAYMENT_EXPIRY_MINUTES * 60_000);

    const [updated] = await db
      .update(redemptions)
      .set({
        status: "AWAITING_PAYMENT",
        confirmedAt: new Date(),
        paymentExpiresAt,
        billplzUrl: bill.url,
        updatedAt: new Date(),
      })
      .where(and(eq(redemptions.id, row.id), eq(redemptions.status, "PENDING_CONFIRMATION")))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Redemption ini sudah disahkan" }, { status: 409 });
    }

    await writeAuditLog(db, {
      actorId: user.id,
      actorType: "CUSTOMER",
      action: "REDEMPTION_OTP_CONFIRMED",
      entity: "redemptions",
      entityId: updated.id,
      before: row,
      after: updated,
      reason: "Awaiting shortfall payment via Billplz",
    });

    return NextResponse.json({
      ok: true,
      redemption: {
        redemptionRef: updated.redemptionRef,
        status: updated.status,
        totalPaymentRm: formatRm(totalPaymentRm),
        paymentExpiresAt: updated.paymentExpiresAt,
        paymentUrl: bill.url,
      },
    });
  }

  // No shortfall to pay — go straight to PROCESSING (spec section 13).
  const [updated] = await db
    .update(redemptions)
    .set({
      status: "PROCESSING",
      confirmedAt: new Date(),
      paymentConfirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(redemptions.id, row.id), eq(redemptions.status, "PENDING_CONFIRMATION")))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Redemption ini sudah disahkan" }, { status: 409 });
  }

  await writeAuditLog(db, {
    actorId: user.id,
    actorType: "CUSTOMER",
    action: "REDEMPTION_OTP_CONFIRMED",
    entity: "redemptions",
    entityId: updated.id,
    before: row,
    after: updated,
    reason: "No RM shortfall — no payment gateway transaction created, moved straight to processing",
  });

  return NextResponse.json({
    ok: true,
    redemption: {
      redemptionRef: updated.redemptionRef,
      status: updated.status,
      gramUsed: formatGram(updated.gramUsed),
    },
  });
}
