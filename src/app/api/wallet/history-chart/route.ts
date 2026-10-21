import { NextResponse } from "next/server";
import { db } from "@/db";
import { walletLedger } from "@/db/schema";
import { and, asc, eq, gte } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { formatGram } from "@/lib/decimal";

// Advanced Dashboard — Fungsi 3 (Graf Perkembangan Simpanan). Plots the
// customer's own ledger balanceAfter over time -- the same number every
// other balance figure in this app derives from (wallet.ts's golden rule:
// "BALANCE = hasil ledger"), never a separately recomputed total, so this
// can never drift from what /api/wallet or the admin dashboard shows.
const PERIOD_DAYS: Record<string, number | null> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
  all: null,
};

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "6m";
  const days = Object.prototype.hasOwnProperty.call(PERIOD_DAYS, period) ? PERIOD_DAYS[period] : PERIOD_DAYS["6m"];

  const conditions = [eq(walletLedger.customerId, user.id)];
  if (days != null) {
    conditions.push(gte(walletLedger.timestamp, new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
  }

  const rows = await db
    .select({ timestamp: walletLedger.timestamp, balanceAfter: walletLedger.balanceAfter })
    .from(walletLedger)
    .where(and(...conditions))
    .orderBy(asc(walletLedger.timestamp));

  return NextResponse.json({
    period,
    points: rows.map((r) => ({ date: r.timestamp, balanceGram: formatGram(r.balanceAfter, 4) })),
  });
}
