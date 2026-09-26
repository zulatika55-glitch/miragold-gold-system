import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { expireStaleHolds, getAvailableGold } from "@/lib/wallet";
import { Decimal, toDecimal, formatGram, formatRm, GRAM_STORAGE_DECIMALS } from "@/lib/decimal";
import { computeRedemptionAmounts } from "@/lib/redemption";

function serialize(row: typeof redemptions.$inferSelect) {
  const amounts = computeRedemptionAmounts(row);
  return {
    redemptionRef: row.redemptionRef,
    createdAt: row.createdAt,
    productName: row.productName,
    sku: row.sku,
    itemWeightGram: formatGram(row.itemWeightGram),
    gramUsed: formatGram(row.gramUsed),
    sellPriceSnapshot: formatRm(row.sellPriceSnapshot),
    upahRm: formatRm(row.upahRm),
    otherChargesRm: formatRm(row.otherChargesRm),
    postageRm: formatRm(row.postageRm),
    shortfallGram: formatGram(amounts.shortfallGram),
    shortfallValueRm: formatRm(amounts.shortfallValueRm),
    totalPaymentRm: formatRm(amounts.totalPaymentRm),
    deliveryMethod: row.deliveryMethod,
    status: row.status,
    otpExpiresAt: row.otpExpiresAt,
    paymentExpiresAt: row.paymentExpiresAt,
    billplzUrl: row.status === "AWAITING_PAYMENT" ? row.billplzUrl : null,
    cancelReason: row.cancelReason,
  };
}

// Spec section 8 — the customer's own view of a quotation staff created for
// them, with the full breakdown shown before they confirm.
export async function GET(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { redemptionRef } = await params;
  await expireStaleHolds(db, user.id);

  const [row] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!row || row.customerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ redemption: serialize(row) });
}

const patchBodySchema = z.object({ gramUsed: z.number().min(0) });

// Spec section 4 — the customer may lower how much Gold Wallet gram to
// apply (never above the item's own weight) before confirming. Only allowed
// pre-confirmation: once the customer taps "Sahkan Tebusan" (request-otp),
// gramUsed is locked for good (spec section 14 — no silent changes to a
// quotation someone has already committed to).
export async function PATCH(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const parsed = patchBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { redemptionRef } = await params;
  const [row] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!row || row.customerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== "AWAITING_CUSTOMER_CONFIRMATION") {
    return NextResponse.json({ error: `Redemption ini pada status ${row.status}, tidak boleh diubah` }, { status: 409 });
  }

  const gramUsed = toDecimal(parsed.data.gramUsed).toDecimalPlaces(GRAM_STORAGE_DECIMALS, Decimal.ROUND_DOWN);
  const itemWeightGram = toDecimal(row.itemWeightGram);
  if (gramUsed.gt(itemWeightGram)) {
    return NextResponse.json({ error: `Gram digunakan tidak boleh melebihi berat barang (${formatGram(itemWeightGram)}g)` }, { status: 400 });
  }

  await expireStaleHolds(db, user.id);
  const available = await getAvailableGold(user.id);
  if (gramUsed.gt(available)) {
    return NextResponse.json({ error: `Jumlah melebihi baki tersedia (${formatGram(available)}g)` }, { status: 400 });
  }

  const [updated] = await db
    .update(redemptions)
    .set({ gramUsed: gramUsed.toFixed(GRAM_STORAGE_DECIMALS), updatedAt: new Date() })
    .where(and(eq(redemptions.id, row.id), eq(redemptions.status, "AWAITING_CUSTOMER_CONFIRMATION")))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Redemption ini sudah dikemaskini oleh proses lain, sila muat semula" }, { status: 409 });
  }

  return NextResponse.json({ redemption: serialize(updated) });
}
