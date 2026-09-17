import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, payments, users } from "@/db/schema";
import { desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { formatGram, formatRm } from "@/lib/decimal";

// Spec 12: admin must be able to check every transaction — customer, RM,
// locked price, gram, Billplz reference, payment status, wallet credit
// status. The dashboard's summary cards don't give this; this is the
// per-transaction list they link to.
export async function GET(req: Request) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const matchingUserIds = q
    ? (
        await db
          .select({ id: users.id })
          .from(users)
          .where(or(ilike(users.name, `%${q}%`), ilike(users.phone, `%${q}%`), ilike(users.customerId, `%${q}%`)))
      ).map((u) => u.id)
    : null;

  const rows = await db
    .select({
      id: orders.id,
      orderRef: orders.orderRef,
      createdAt: orders.createdAt,
      amountRm: orders.amountRm,
      priceSnapshot: orders.priceSnapshot,
      gram: orders.gram,
      status: orders.status,
      customerName: users.name,
      customerPhone: users.phone,
      customerId: users.customerId,
    })
    .from(orders)
    .innerJoin(users, eq(orders.customerId, users.id))
    .where(matchingUserIds ? inArray(orders.customerId, matchingUserIds) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(200);

  const orderIds = rows.map((o) => o.id);
  const paymentRows = orderIds.length
    ? await db.select().from(payments).where(inArray(payments.orderId, orderIds))
    : [];
  const paymentByOrderId = new Map(paymentRows.map((p) => [p.orderId, p]));

  return NextResponse.json({
    orders: rows.map((o) => {
      const payment = paymentByOrderId.get(o.id);
      return {
        orderRef: o.orderRef,
        createdAt: o.createdAt,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerId: o.customerId,
        amountRm: formatRm(o.amountRm),
        priceSnapshot: formatRm(o.priceSnapshot),
        gram: formatGram(o.gram),
        orderStatus: o.status,
        billplzBillId: payment?.providerBillId ?? null,
        paymentStatus: payment?.status ?? "PENDING",
        // Wallet credit only ever happens when the order reaches
        // COMPLETED (see the Billplz webhook) — never inferred any other way.
        walletCredited: o.status === "COMPLETED",
      };
    }),
  });
}
