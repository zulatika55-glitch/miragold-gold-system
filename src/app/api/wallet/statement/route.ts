import { NextResponse } from "next/server";
import { db } from "@/db";
import { walletLedger } from "@/db/schema";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { formatGram } from "@/lib/decimal";

// Advanced Dashboard — Fungsi 12 (Download Penyata PDF). Read-only: builds
// on the exact same wallet_ledger rows and balanceAfter values every other
// wallet view already shows (schema.ts's golden rule — "BALANCE = hasil
// ledger"), so a statement can never show a figure the customer can't also
// see on /wallet or the dashboard. Period keys deliberately match
// history-chart's own PERIOD_DAYS convention.
//
// The PDF itself is produced client-side via the browser's print dialog
// ("Simpan sebagai PDF"), matching the existing single-order receipt
// pattern in src/app/wallet/page.tsx (downloadReceipt()) rather than
// adding a new server-side PDF dependency.
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
  const period = searchParams.get("period") ?? "all";
  const days = Object.prototype.hasOwnProperty.call(PERIOD_DAYS, period) ? PERIOD_DAYS[period] : PERIOD_DAYS.all;
  const windowStart = days != null ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  // Opening balance = balanceAfter of the last entry strictly before the
  // window start. 0 if this is the customer's first-ever activity, or if
  // period is "all" (there is nothing "before" all time).
  let openingBalanceGram = "0";
  if (windowStart) {
    const [priorEntry] = await db
      .select({ balanceAfter: walletLedger.balanceAfter })
      .from(walletLedger)
      .where(and(eq(walletLedger.customerId, user.id), lt(walletLedger.timestamp, windowStart)))
      .orderBy(desc(walletLedger.timestamp))
      .limit(1);
    if (priorEntry) openingBalanceGram = priorEntry.balanceAfter;
  }

  const conditions = [eq(walletLedger.customerId, user.id)];
  if (windowStart) conditions.push(gte(walletLedger.timestamp, windowStart));

  // Chronological (oldest first) — a statement reads top-to-bottom like a
  // bank/e-wallet statement, unlike /wallet's newest-first activity list.
  const entries = await db
    .select()
    .from(walletLedger)
    .where(and(...conditions))
    .orderBy(asc(walletLedger.timestamp))
    .limit(1000);

  const closingBalanceGram = entries.length > 0 ? entries[entries.length - 1].balanceAfter : openingBalanceGram;

  return NextResponse.json({
    period,
    generatedAt: new Date().toISOString(),
    customer: { name: user.name, customerId: user.customerId },
    openingBalanceGram: formatGram(openingBalanceGram),
    closingBalanceGram: formatGram(closingBalanceGram),
    entries: entries.map((h) => ({
      ledgerRef: h.ledgerRef,
      type: h.type,
      direction: h.direction,
      gram: formatGram(h.gram),
      priceSnapshot: h.priceSnapshot,
      balanceAfter: formatGram(h.balanceAfter),
      refId: h.refId,
      timestamp: h.timestamp,
    })),
  });
}
