import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, payments, pendingAllocations, redemptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { verifyXSignature } from "@/lib/billplz";
import { postLedgerEntry } from "@/lib/wallet";
import { writeAuditLog } from "@/lib/audit";
import { newPaymentRef } from "@/lib/refs";
import { computeRedemptionAmounts } from "@/lib/redemption";

/**
 * Billplz server-to-server callback. This is the ONLY place gram/state is
 * ever credited/advanced from a payment — never the client-side redirect
 * page (spec: "Screenshot customer bukan bukti settlement").
 *
 * Idempotency (spec 14 & 16.4): Billplz's bill `id` is used as our
 * payments.idempotency_key, which has a unique DB constraint. If the same
 * webhook fires twice (Billplz retries on non-200, or a duplicate POST),
 * the second attempt finds the existing PAID payment and returns success
 * without crediting/advancing anything again.
 *
 * Serves TWO transaction kinds off one collection (reference_1's prefix
 * tells them apart): Module 03 orders ("ORD-...", handled below) and Fasa
 * 2B redemption shortfall payments ("RDM-...", handleRedemptionWebhook).
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const payload: Record<string, string> = {};
  for (const [key, value] of form.entries()) payload[key] = String(value);

  if (!verifyXSignature(payload)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const billId = payload.id;
  const paid = payload.paid === "true" || payload.paid === "1";
  const ref = payload.reference_1;

  if (!billId || !ref) {
    return NextResponse.json({ error: "Missing bill id or reference" }, { status: 400 });
  }

  if (ref.startsWith("RDM-")) {
    return handleRedemptionWebhook(payload, billId, paid, ref);
  }

  const orderRef = ref;

  // Idempotency guard.
  const [existingPayment] = await db.select().from(payments).where(eq(payments.idempotencyKey, billId)).limit(1);
  if (existingPayment?.status === "PAID") {
    return NextResponse.json({ ok: true, note: "Already processed" });
  }

  const [order] = await db.select().from(orders).where(eq(orders.orderRef, orderRef)).limit(1);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!paid) {
    if (!existingPayment) {
      await db.insert(payments).values({
        paymentRef: newPaymentRef(),
        orderId: order.id,
        provider: "BILLPLZ",
        providerBillId: billId,
        idempotencyKey: billId,
        amount: order.amountRm,
        status: "FAILED",
        rawPayload: payload,
      });
    }
    await db.update(orders).set({ status: "FAILED", updatedAt: new Date() }).where(eq(orders.id, order.id));
    return NextResponse.json({ ok: true, note: "Payment not successful" });
  }

  // Loophole 16.1: price-lock expiry. If the lock window passed before
  // payment landed, do NOT auto-credit at the (now stale) snapshot price —
  // queue for manual review instead of silently honouring an old price.
  const isExpired = order.lockExpiresAt.getTime() < Date.now();

  if (isExpired && order.status === "PENDING") {
    const [payment] = await db
      .insert(payments)
      .values({
        paymentRef: newPaymentRef(),
        orderId: order.id,
        provider: "BILLPLZ",
        providerBillId: billId,
        idempotencyKey: billId,
        amount: order.amountRm,
        status: "PAID",
        confirmedAt: new Date(),
        rawPayload: payload,
      })
      .returning();

    await db.update(orders).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await db.insert(pendingAllocations).values({
      paymentId: payment.id,
      orderId: order.id,
      reason: "Payment received after price-lock window expired — needs manual price/gram confirmation before crediting wallet.",
    });

    return NextResponse.json({ ok: true, note: "Payment received; queued for manual allocation (price lock expired)" });
  }

  try {
    await db.transaction(async (tx) => {
      const [payment] = existingPayment
        ? [existingPayment]
        : await tx
            .insert(payments)
            .values({
              paymentRef: newPaymentRef(),
              orderId: order.id,
              provider: "BILLPLZ",
              providerBillId: billId,
              idempotencyKey: billId,
              amount: order.amountRm,
              status: "PAID",
              confirmedAt: new Date(),
              rawPayload: payload,
            })
            .returning();

      if (payment.status !== "PAID") {
        await tx
          .update(payments)
          .set({ status: "PAID", confirmedAt: new Date(), rawPayload: payload })
          .where(eq(payments.id, payment.id));
      }

      await tx.update(orders).set({ status: "CONFIRMED", updatedAt: new Date() }).where(eq(orders.id, order.id));

      await postLedgerEntry(tx, {
        customerId: order.customerId,
        type: "LOCK_BUY",
        direction: "IN",
        gram: order.gram,
        priceSnapshot: order.priceSnapshot,
        refType: "ORDER",
        refId: order.orderRef,
        createdBy: null, // system/webhook
      });

      await tx.update(orders).set({ status: "COMPLETED", updatedAt: new Date() }).where(eq(orders.id, order.id));

      await writeAuditLog(tx, {
        actorType: "SYSTEM",
        action: "WALLET_CREDIT_LOCK_BUY",
        entity: "orders",
        entityId: order.id,
        after: { gram: order.gram, amountRm: order.amountRm, billId },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Spec 16.3: "Payment success but wallet failure -> PAYMENT
    // RECEIVED / PENDING ALLOCATION queue" — never lose the customer's
    // money even if crediting the wallet fails.
    const [payment] = await db.select().from(payments).where(eq(payments.idempotencyKey, billId)).limit(1);
    if (payment) {
      await db.insert(pendingAllocations).values({
        paymentId: payment.id,
        orderId: order.id,
        reason: `Wallet credit failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      await db.update(orders).set({ status: "CONFIRMED", updatedAt: new Date() }).where(eq(orders.id, order.id));
    }

    return NextResponse.json({ ok: true, note: "Payment received; queued for manual allocation" });
  }
}

/**
 * Fasa 2B — Module 05 redemption shortfall payment. Deliberately does NOT
 * touch the wallet ledger or the gold hold here: spec section 17 places the
 * final gram deduction only at the admin's explicit /complete action, well
 * after the item is physically handed over — this step only advances
 * AWAITING_PAYMENT -> PAYMENT_CONFIRMED so staff know they can start
 * preparing the item (see the /process route).
 */
async function handleRedemptionWebhook(payload: Record<string, string>, billId: string, paid: boolean, redemptionRef: string) {
  const [existingPayment] = await db.select().from(payments).where(eq(payments.idempotencyKey, billId)).limit(1);
  if (existingPayment?.status === "PAID") {
    return NextResponse.json({ ok: true, note: "Already processed" });
  }

  const [redemption] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!redemption) {
    return NextResponse.json({ error: "Redemption not found" }, { status: 404 });
  }

  const { totalPaymentRm } = computeRedemptionAmounts(redemption);

  if (!paid) {
    if (!existingPayment) {
      await db.insert(payments).values({
        paymentRef: newPaymentRef(),
        redemptionId: redemption.id,
        provider: "BILLPLZ",
        providerBillId: billId,
        idempotencyKey: billId,
        amount: totalPaymentRm.toFixed(6),
        status: "FAILED",
        rawPayload: payload,
      });
    }
    // Deliberately leaves redemption.status untouched (still AWAITING_PAYMENT)
    // so the customer can retry payment on the same bill/quotation — spec
    // section 13: "Failed ... jangan deduct gram secara final", nothing final
    // has happened either way. expireStaleRedemptions() will lazily expire it
    // once paymentExpiresAt passes without a successful payment.
    return NextResponse.json({ ok: true, note: "Payment not successful" });
  }

  const isExpired = redemption.paymentExpiresAt ? redemption.paymentExpiresAt.getTime() < Date.now() : false;

  if (isExpired && redemption.status === "AWAITING_PAYMENT") {
    const [payment] = await db
      .insert(payments)
      .values({
        paymentRef: newPaymentRef(),
        redemptionId: redemption.id,
        provider: "BILLPLZ",
        providerBillId: billId,
        idempotencyKey: billId,
        amount: totalPaymentRm.toFixed(6),
        status: "PAID",
        confirmedAt: new Date(),
        rawPayload: payload,
      })
      .returning();

    await db.insert(pendingAllocations).values({
      paymentId: payment.id,
      redemptionId: redemption.id,
      reason: "Payment received after the redemption quotation's payment window expired — needs manual review before proceeding.",
    });

    return NextResponse.json({ ok: true, note: "Payment received; queued for manual allocation (quotation expired)" });
  }

  try {
    await db.transaction(async (tx) => {
      const [payment] = existingPayment
        ? [existingPayment]
        : await tx
            .insert(payments)
            .values({
              paymentRef: newPaymentRef(),
              redemptionId: redemption.id,
              provider: "BILLPLZ",
              providerBillId: billId,
              idempotencyKey: billId,
              amount: totalPaymentRm.toFixed(6),
              status: "PAID",
              confirmedAt: new Date(),
              rawPayload: payload,
            })
            .returning();

      if (payment.status !== "PAID") {
        await tx
          .update(payments)
          .set({ status: "PAID", confirmedAt: new Date(), rawPayload: payload })
          .where(eq(payments.id, payment.id));
      }

      const [updated] = await tx
        .update(redemptions)
        .set({ status: "PAYMENT_CONFIRMED", paymentConfirmedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(redemptions.id, redemption.id), eq(redemptions.status, "AWAITING_PAYMENT")))
        .returning();

      // No `updated` row is not an error — it means a duplicate webhook
      // arrived after this redemption already advanced past AWAITING_PAYMENT
      // (idempotency), which is fine: nothing more to do.
      if (updated) {
        await writeAuditLog(tx, {
          actorType: "SYSTEM",
          action: "REDEMPTION_PAYMENT_CONFIRMED",
          entity: "redemptions",
          entityId: updated.id,
          after: updated,
          reason: `Billplz bill ${billId} paid`,
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const [payment] = await db.select().from(payments).where(eq(payments.idempotencyKey, billId)).limit(1);
    if (payment) {
      await db.insert(pendingAllocations).values({
        paymentId: payment.id,
        redemptionId: redemption.id,
        reason: `Redemption payment confirmation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return NextResponse.json({ ok: true, note: "Payment received; queued for manual allocation" });
  }
}
