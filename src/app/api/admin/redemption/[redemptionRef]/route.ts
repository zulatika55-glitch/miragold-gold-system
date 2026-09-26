import { NextResponse } from "next/server";
import { db } from "@/db";
import { redemptions, users, auditLogs } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { formatGram, formatRm } from "@/lib/decimal";
import { computeRedemptionAmounts } from "@/lib/redemption";

// Admin detail view (spec section 8), including the full audit trail for
// this one redemption (spec section 21), mirroring
// /api/admin/buyback/[requestRef].
export async function GET(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { redemptionRef } = await params;
  const [row] = await db
    .select({
      id: redemptions.id,
      redemptionRef: redemptions.redemptionRef,
      createdAt: redemptions.createdAt,
      productName: redemptions.productName,
      sku: redemptions.sku,
      itemWeightGram: redemptions.itemWeightGram,
      gramUsed: redemptions.gramUsed,
      sellPriceSnapshot: redemptions.sellPriceSnapshot,
      upahRatePerGramSnapshot: redemptions.upahRatePerGramSnapshot,
      upahRm: redemptions.upahRm,
      upahOverrideReason: redemptions.upahOverrideReason,
      otherChargesRm: redemptions.otherChargesRm,
      postageRm: redemptions.postageRm,
      deliveryMethod: redemptions.deliveryMethod,
      deliveryDetails: redemptions.deliveryDetails,
      deliveryTrackingReference: redemptions.deliveryTrackingReference,
      status: redemptions.status,
      otpExpiresAt: redemptions.otpExpiresAt,
      confirmedAt: redemptions.confirmedAt,
      paymentExpiresAt: redemptions.paymentExpiresAt,
      paymentConfirmedAt: redemptions.paymentConfirmedAt,
      notes: redemptions.notes,
      cancelReason: redemptions.cancelReason,
      cancelledAt: redemptions.cancelledAt,
      processedAt: redemptions.processedAt,
      readyAt: redemptions.readyAt,
      completedAt: redemptions.completedAt,
      customerName: users.name,
      customerPhone: users.phone,
      customerId: users.customerId,
    })
    .from(redemptions)
    .innerJoin(users, eq(redemptions.customerId, users.id))
    .where(eq(redemptions.redemptionRef, redemptionRef))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const trail = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, "redemptions"), eq(auditLogs.entityId, row.id)))
    .orderBy(asc(auditLogs.timestamp));

  const amounts = computeRedemptionAmounts(row);

  return NextResponse.json({
    redemption: {
      ...row,
      itemWeightGram: formatGram(row.itemWeightGram),
      gramUsed: formatGram(row.gramUsed),
      sellPriceSnapshot: formatRm(row.sellPriceSnapshot),
      upahRatePerGramSnapshot: row.upahRatePerGramSnapshot ? formatRm(row.upahRatePerGramSnapshot) : null,
      upahRm: formatRm(row.upahRm),
      otherChargesRm: formatRm(row.otherChargesRm),
      postageRm: formatRm(row.postageRm),
      shortfallGram: formatGram(amounts.shortfallGram),
      shortfallValueRm: formatRm(amounts.shortfallValueRm),
      totalPaymentRm: formatRm(amounts.totalPaymentRm),
    },
    auditTrail: trail.map((a) => ({ action: a.action, actorType: a.actorType, reason: a.reason, timestamp: a.timestamp })),
  });
}
