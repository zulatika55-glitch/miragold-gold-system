import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users, walletLedger } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Decimal, toDecimal, GRAM_STORAGE_DECIMALS } from "./decimal";
import { newLedgerRef } from "./refs";
import type { Executor } from "@/db/types";

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
  await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${params.customerId} FOR UPDATE`);

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
