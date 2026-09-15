import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, walletLedger, pendingAllocations, goldPrices, orders } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { Decimal, formatGram, formatRm } from "@/lib/decimal";

// Small set of numbers for the admin dashboard hub — not meant to replace a
// full reporting module (spec's later Sankyu/reconciliation phase), just
// enough for an owner/admin to see the pilot is healthy at a glance.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminOrAbove(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [[customerCount], [staffCount], [gramIn], [gramOut], [pendingCount], [latestPrice], startOfToday] =
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
      Promise.resolve(new Date(new Date().setUTCHours(0, 0, 0, 0))),
    ]);

  const [ordersToday] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(gte(orders.createdAt, startOfToday)));

  const totalGram = new Decimal(gramIn.total).minus(new Decimal(gramOut.total));

  return NextResponse.json({
    totalCustomers: customerCount.n,
    totalStaff: staffCount.n,
    totalGramInCirculation: formatGram(totalGram),
    pendingAllocations: pendingCount.n,
    ordersToday: ordersToday.n,
    currentPrice: latestPrice
      ? { sellPrice916: formatRm(latestPrice.sellPrice916), buybackPrice916: formatRm(latestPrice.buybackPrice916) }
      : null,
  });
}
