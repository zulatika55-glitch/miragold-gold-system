import { NextResponse } from "next/server";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { expireStaleHolds } from "@/lib/wallet";
import { formatGram, formatRm } from "@/lib/decimal";
import { computeRedemptionAmounts } from "@/lib/redemption";

// Fasa 2B — Module 05 (Tebus Barang Kemas). Customer's own redemption
// history (spec section 19), mirroring GET /api/wallet/buyback: every
// quotation staff has created for them, whatever its outcome.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  await expireStaleHolds(db, user.id);

  const rows = await db
    .select()
    .from(redemptions)
    .where(eq(redemptions.customerId, user.id))
    .orderBy(desc(redemptions.createdAt))
    .limit(100);

  return NextResponse.json({
    redemptions: rows.map((r) => {
      const amounts = computeRedemptionAmounts(r);
      return {
        redemptionRef: r.redemptionRef,
        createdAt: r.createdAt,
        productName: r.productName,
        sku: r.sku,
        itemWeightGram: formatGram(r.itemWeightGram),
        gramUsed: formatGram(r.gramUsed),
        shortfallGram: formatGram(amounts.shortfallGram),
        totalPaymentRm: formatRm(amounts.totalPaymentRm),
        status: r.status,
        deliveryMethod: r.deliveryMethod,
        cancelReason: r.cancelReason,
      };
    }),
  });
}
