import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { goldPrices, orders, payments } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { calcGramFromAmount, formatGram, formatRm, toDecimal } from "@/lib/decimal";
import { newOrderRef } from "@/lib/refs";
import { createBill } from "@/lib/billplz";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  amountRm: z.number().positive(),
});

const MINIMUM_RM = 100;

// Module 03/06 — the customer's own Lock/Buy order history, spec 6.6:
// every attempt (not just successful ones) so a failed/expired order is
// still visible, not silently dropped from what the customer sees.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(100);

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
        amountRm: formatRm(o.amountRm),
        priceSnapshot: formatRm(o.priceSnapshot),
        gram: formatGram(o.gram),
        status: o.status,
        lockExpiresAt: o.lockExpiresAt,
        billplzBillId: payment?.providerBillId ?? null,
        paymentStatus: payment?.status ?? "PENDING",
      };
    }),
  });
}

// Module 03 — Lock / Buy Emas 916.
// Flow (spec 6.2 table): amount -> price snapshot -> gram -> review ->
// price lock -> pay (Billplz) -> gateway confirm (webhook) -> credit wallet.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: `Account is ${user.status}` }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { amountRm } = parsed.data;
  if (amountRm < MINIMUM_RM) {
    return NextResponse.json({ error: `Minimum transaction is RM${MINIMUM_RM}` }, { status: 400 });
  }

  const [latestPrice] = await db.select().from(goldPrices).orderBy(desc(goldPrices.effectiveAt)).limit(1);
  if (!latestPrice) {
    return NextResponse.json({ error: "Gold price is not available right now" }, { status: 503 });
  }

  const gram = calcGramFromAmount(amountRm, latestPrice.sellPrice916);
  const lockMinutes = Number(process.env.PRICE_LOCK_MINUTES ?? "10");
  const lockExpiresAt = new Date(Date.now() + lockMinutes * 60_000);

  const [order] = await db
    .insert(orders)
    .values({
      orderRef: newOrderRef(),
      customerId: user.id,
      amountRm: toDecimal(amountRm).toFixed(6),
      priceSnapshot: latestPrice.sellPrice916,
      gram: gram.toFixed(8),
      goldPriceId: latestPrice.id,
      status: "PENDING",
      lockExpiresAt,
    })
    .returning();

  await writeAuditLog(db, {
    actorId: user.id,
    actorType: user.role as "CUSTOMER" | "STAFF" | "SUPERVISOR" | "ADMIN" | "OWNER",
    action: "ORDER_CREATED",
    entity: "orders",
    entityId: order.id,
    after: order,
  });

  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  try {
    const bill = await createBill({
      amountSen: Math.round(amountRm * 100),
      name: user.name,
      email: user.email ?? undefined,
      mobile: user.phone,
      description: `Miragold Gold Wallet - Lock/Buy Emas 916 (${order.orderRef})`,
      reference1Label: "Order Ref",
      reference1: order.orderRef,
      callbackUrl: `${appBaseUrl}/api/payments/billplz/webhook`,
      redirectUrl: `${appBaseUrl}/api/payments/billplz/redirect?order=${order.orderRef}`,
    });

    return NextResponse.json({
      order: {
        orderRef: order.orderRef,
        amountRm: order.amountRm,
        priceSnapshot: order.priceSnapshot,
        gram: order.gram,
        lockExpiresAt: order.lockExpiresAt,
        status: order.status,
      },
      paymentUrl: bill.url,
    });
  } catch (err) {
    // Billplz unreachable/misconfigured — cancel the order rather than
    // leaving a PENDING order with no way to pay.
    await db.update(orders).set({ status: "CANCELLED" }).where(eq(orders.id, order.id));
    return NextResponse.json(
      { error: "Could not start payment. Please try again shortly.", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
