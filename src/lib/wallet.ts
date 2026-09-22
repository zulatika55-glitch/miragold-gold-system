import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users, walletLedger, buybackRequests } from "@/db/schema";
import { and, eq, inArray, lt } from "drizzle-orm";
import { Decimal, toDecimal, GRAM_STORAGE_DECIMALS } from "./decimal";
import { newLedgerRef } from "./refs";
import { writeAuditLog } from "./audit";
import type { Executor } from "@/db/types";

// Fasa 2A (Buyback) statuses that still hold gram back from the wallet —
// anything not in this list has either released the hold (REJECTED /
// CANCELLED / EXPIRED) or already moved the gram out via the ledger
// (COMPLETED), so it must NOT be double-counted (spec section 7 & 19).
const ACTIVE_HOLD_STATUSES = ["PENDING_CONFIRMATION", "ON_HOLD", "PROCESSING", "PAID"] as const;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Golden rule (spec, Module 04 table): "BALANCE = hasil ledger. Jangan
 * jadikan satu editable number sebagai sumber kebenaran." Wallet balance is
 * ALWAYS derived by summing wallet_ledger, never stored/edited directly.
 */
export async function getWalletBalance(customerId: string, executor: Executor = db): Promise<Decimal> {
  const [row] = await executor
    .select({
      total: sql<string>`COALESCE(SUM(CASE WHEN ${walletLedger.direction} = 'IN' THEN ${walletLedger.gram} ELSE -${walletLedger.gram} END), 0)`,
    })
    .from(walletLedger)
    .where(eq(walletLedger.customerId, customerId));

  return toDecimal(row?.total ?? "0");
}

/**
 * Any PENDING_CONFIRMATION buyback request whose OTP window has passed
 * without the customer confirming is expired here (lazily, on read) so its
 * held gram becomes available again — mirrors how order price-locks expire
 * without a background job (spec section 7: gram must not stay stuck on
 * hold forever just because a customer abandoned the OTP step).
 */
export async function expireStaleBuybackRequests(executor: Executor = db, customerId?: string): Promise<void> {
  const conditions = [eq(buybackRequests.status, "PENDING_CONFIRMATION"), lt(buybackRequests.otpExpiresAt, new Date())];
  if (customerId) conditions.push(eq(buybackRequests.customerId, customerId));

  const stale = await executor
    .select({ id: buybackRequests.id })
    .from(buybackRequests)
    .where(and(...conditions));

  for (const row of stale) {
    const [updated] = await executor
      .update(buybackRequests)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(and(eq(buybackRequests.id, row.id), eq(buybackRequests.status, "PENDING_CONFIRMATION")))
      .returning();

    if (updated) {
      await writeAuditLog(executor, {
        actorType: "SYSTEM",
        action: "BUYBACK_OTP_EXPIRED",
        entity: "buyback_requests",
        entityId: updated.id,
        after: updated,
        reason: "Customer did not complete OTP confirmation within the window — hold released.",
      });
    }
  }
}

/** Total gram currently held across the customer's active (not yet
 * completed/rejected/cancelled/expired) buyback requests — spec section 7's
 * "Gold On Hold". Always call `expireStaleBuybackRequests` first if the
 * caller needs an up-to-date figure (e.g. before accepting a new request). */
export async function getGramOnHold(customerId: string, executor: Executor = db): Promise<Decimal> {
  const [row] = await executor
    .select({ total: sql<string>`COALESCE(SUM(${buybackRequests.gram}), 0)` })
    .from(buybackRequests)
    .where(and(eq(buybackRequests.customerId, customerId), inArray(buybackRequests.status, ACTIVE_HOLD_STATUSES)));

  return toDecimal(row?.total ?? "0");
}

/** Available Gold = Total Gold (ledger balance) minus Gold On Hold (spec
 * section 7). This is the figure that gates a NEW buyback request — the
 * ledger-derived Total Gold does not shrink until the request COMPLETES. */
export async function getAvailableGold(customerId: string, executor: Executor = db): Promise<Decimal> {
  const [balance, onHold] = await Promise.all([
    getWalletBalance(customerId, executor),
    getGramOnHold(customerId, executor),
  ]);
  return balance.minus(onHold);
}

/**
 * Locks the customer's `users` row for the duration of the current DB
 * transaction so any concurrent wallet/hold-affecting operation for the
 * SAME customer serializes behind it (spec 14 & 16.13 "Two simultaneous
 * uses of same wallet", and Fasa 2A UAT "customer buka dua browser/device
 * dan cuba jual gram yang sama"). Shared by postLedgerEntry() below and by
 * the buyback request-creation route, so both kinds of wallet-affecting
 * writes serialize against each other, not just against their own kind.
 */
export async function lockCustomerRow(tx: Tx, customerId: string): Promise<void> {
  await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${customerId} FOR UPDATE`);
}

/**
 * Posts one wallet_ledger entry inside an existing DB transaction.
 *
 * Concurrency safety (spec 14 & 16.13 "Two simultaneous uses of same
 * wallet"): locks the customer's `users` row with SELECT ... FOR UPDATE
 * first, so two concurrent wallet-affecting transactions for the SAME
 * customer are serialized by Postgres row-locking — the second waits for
 * the first to commit before it can read/compute the balance, which
 * prevents concurrent double-spend.
 *
 * Callers MUST run this inside `db.transaction(async (tx) => { ... })` and
 * pass `tx` as `executor`.
 */
export async function postLedgerEntry(
  tx: Tx,
  params: {
    customerId: string;
    type: "LOCK_BUY" | "REDEMPTION" | "BUYBACK" | "CONVERSION" | "TRADE_IN" | "ADJUSTMENT" | "REVERSAL";
    direction: "IN" | "OUT";
    gram: Decimal | string | number;
    priceSnapshot?: Decimal | string | number | null;
    refType: string;
    refId: string;
    reason?: string;
    createdBy?: string | null;
    approvedBy?: string | null;
    reversalOfLedgerId?: string | null;
  },
) {
  // Lock the customer row for the duration of this transaction so
  // concurrent wallet operations for this customer serialize.
  await lockCustomerRow(tx, params.customerId);

  const gram = toDecimal(params.gram).toDecimalPlaces(GRAM_STORAGE_DECIMALS, Decimal.ROUND_DOWN);
  if (gram.lte(0)) throw new Error("Ledger gram amount must be positive");

  const currentBalance = await getWalletBalance(params.customerId, tx);
  const balanceAfter =
    params.direction === "IN" ? currentBalance.plus(gram) : currentBalance.minus(gram);

  if (params.direction === "OUT" && balanceAfter.lt(0)) {
    throw new Error("Insufficient wallet balance for this operation");
  }

  if (params.type === "ADJUSTMENT" && (!params.reason || !params.approvedBy)) {
    throw new Error("ADJUSTMENT entries require both a reason and an approver (spec: controlled adjustment)");
  }

  const [entry] = await tx
    .insert(walletLedger)
    .values({
      ledgerRef: newLedgerRef(),
      customerId: params.customerId,
      type: params.type,
      direction: params.direction,
      gram: gram.toFixed(GRAM_STORAGE_DECIMALS),
      priceSnapshot: params.priceSnapshot != null ? toDecimal(params.priceSnapshot).toFixed(6) : null,
      refType: params.refType,
      refId: params.refId,
      balanceAfter: balanceAfter.toFixed(GRAM_STORAGE_DECIMALS),
      reversalOfLedgerId: params.reversalOfLedgerId ?? null,
      reason: params.reason ?? null,
      createdBy: params.createdBy ?? null,
      approvedBy: params.approvedBy ?? null,
    })
    .returning();

  return entry;
}
