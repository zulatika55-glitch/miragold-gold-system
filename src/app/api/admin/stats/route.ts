import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, walletLedger, pendingAllocations, goldPrices, orders, buybackRequests } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { Decimal, GRAM_LIABILITY_DECIMALS, formatGram, formatRm } from "@/lib/decimal";
import { expireStaleBuybackRequests } from "@/lib/wallet";

// Small set of numbers for the admin dashboard hub — not meant to replace a
// full reporting module (spec's later Sankyu/reconciliation phase), just
// enough for an owner/admin to see the pilot is healthy at a glance.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminOrAbove(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Release any abandoned Jual Emas holds first so the On Hold figure below
  // is never stale (Fasa 2A spec section 7).
  await expireStaleBuybackRequests(db);

  const [[customerCount], [staffCount], [gramIn], [gramOut], [pendingCount], [latestPrice], [gramOnHoldRow], startOfToday] =
    await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "CUSTOMER")),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(sql`${users.role} in ('STAFF','SUPERVISOR','ADMIN','OWNER')`),
      db
        .select({ total: sql<string>`coalesce(sum(${walletLedger.gram}), 0)` })
        .from(walletLedger)
        .where(eq(walletLedger.direction, "IN")),
      db
        .select({ total: sql<string>`coalesce(sum(${walletLedger.gram}), 0)` })
        .from(walletLedger)
        .where(eq(walletLedger.direction, "OUT")),
      db.select({ n: sql<number>`count(*)::int` }).from(pendingAllocations).where(eq(pendingAllocations.resolved, false)),
      db.select().from(goldPrices).orderBy(desc(goldPrices.effectiveAt)).limit(1),
      // Fasa 2A spec section 17 — "Gold On Hold" across every customer's
      // active buyback requests (same ACTIVE_HOLD_STATUSES set as wallet.ts).
      db
        .select({ total: sql<string>`coalesce(sum(${buybackRequests.gram}), 0)` })
        .from(buybackRequests)
        .where(sql`${buybackRequests.status} IN ('PENDING_CONFIRMATION','ON_HOLD','PROCESSING','PAID')`),
      Promise.resolve(new Date(new Date().setUTCHours(0, 0, 0, 0))),
    ]);

  const [ordersToday] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(gte(orders.createdAt, startOfToday)));

  const totalGram = new Decimal(gramIn.total).minus(new Decimal(gramOut.total));
  const gramOnHold = new Decimal(gramOnHoldRow?.total ?? "0");

  return NextResponse.json({
    totalCustomers: customerCount.n,
    totalStaff: staffCount.n,
    // Total Gold Wallet Liability (spec: sum of every customer's ledger =
    // exact gram Miragold owes across all wallets). Kept at higher
    // precision than the 2dp customer-facing display since this figure is
    // used for reconciliation (sir zul, 17/9).
    totalGramInCirculation: formatGram(totalGram, GRAM_LIABILITY_DECIMALS),
    // Fasa 2A spec section 17: Available Gold = Total - On Hold. On Hold
    // gram is still part of Total (ledger hasn't moved yet) but cannot be
    // sold/used again until its buyback request completes or releases.
    gramOnHold: formatGram(gramOnHold, GRAM_LIABILITY_DECIMALS),
    gramAvailable: formatGram(totalGram.minus(gramOnHold), GRAM_LIABILITY_DECIMALS),
    pendingAllocations: pendingCount.n,
    ordersToday: ordersToday.n,
    currentPrice: latestPrice
      ? { sellPrice916: formatRm(latestPrice.sellPrice916), buybackPrice916: formatRm(latestPrice.buybackPrice916) }
      : null,
  });
}
