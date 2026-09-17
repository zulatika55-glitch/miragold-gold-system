import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { formatGram, formatRm } from "@/lib/decimal";

// Single order lookup, scoped to the logged-in customer — backs the
// "Pembayaran Berjaya" success screen (spec 6.7 sample) so it can show the
// exact locked price/gram for THIS order rather than a generic message.
export async function GET(req: Request, { params }: { params: Promise<{ orderRef: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { orderRef } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.orderRef, orderRef)).limit(1);

  if (!order || order.customerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);

  return NextResponse.json({
    order: {
      orderRef: order.orderRef,
      createdAt: order.createdAt,
      amountRm: formatRm(order.amountRm),
      priceSnapshot: formatRm(order.priceSnapshot),
      gram: formatGram(order.gram),
      status: order.status,
      lockExpiresAt: order.lockExpiresAt,
      billplzBillId: payment?.providerBillId ?? null,
      paymentStatus: payment?.status ?? "PENDING",
    },
  });
}
