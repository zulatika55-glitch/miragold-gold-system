import { NextResponse } from "next/server";
import { db } from "@/db";
import { buybackRequests, users, auditLogs } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { formatGram, formatRm } from "@/lib/decimal";

// Admin detail view (spec section 8: "Admin boleh buka detail setiap
// request") — includes the full audit trail for this one request (spec
// section 18) so a reviewer can see the whole history without leaving the
// page.
export async function GET(req: Request, { params }: { params: Promise<{ requestRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestRef } = await params;
  const [row] = await db
    .select({
      id: buybackRequests.id,
      requestRef: buybackRequests.requestRef,
      createdAt: buybackRequests.createdAt,
      gram: buybackRequests.gram,
      buybackPriceSnapshot: buybackRequests.buybackPriceSnapshot,
      payoutAmountRm: buybackRequests.payoutAmountRm,
      status: buybackRequests.status,
      bankName: buybackRequests.bankName,
      bankAccountNumber: buybackRequests.bankAccountNumber,
      bankAccountHolderName: buybackRequests.bankAccountHolderName,
      rejectReason: buybackRequests.rejectReason,
      payoutDate: buybackRequests.payoutDate,
      payoutReference: buybackRequests.payoutReference,
      payoutAmountPaid: buybackRequests.payoutAmountPaid,
      payoutNote: buybackRequests.payoutNote,
      completedAt: buybackRequests.completedAt,
      customerName: users.name,
      customerPhone: users.phone,
      customerId: users.customerId,
    })
    .from(buybackRequests)
    .innerJoin(users, eq(buybackRequests.customerId, users.id))
    .where(eq(buybackRequests.requestRef, requestRef))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const trail = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, "buyback_requests"), eq(auditLogs.entityId, row.id)))
    .orderBy(asc(auditLogs.timestamp));

  return NextResponse.json({
    request: {
      ...row,
      gram: formatGram(row.gram),
      buybackPriceSnapshot: formatRm(row.buybackPriceSnapshot),
      payoutAmountRm: formatRm(row.payoutAmountRm),
      payoutAmountPaid: row.payoutAmountPaid ? formatRm(row.payoutAmountPaid) : null,
    },
    auditTrail: trail.map((a) => ({ action: a.action, actorType: a.actorType, reason: a.reason, timestamp: a.timestamp })),
  });
}
