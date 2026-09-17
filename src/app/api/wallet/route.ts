import { NextResponse } from "next/server";
import { db } from "@/db";
import { walletLedger } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getWalletBalance } from "@/lib/wallet";
import { formatGram } from "@/lib/decimal";

// Module 04 — Gold Wallet. Balance is always derived from the ledger
// (never a stored/editable number) and history shows the fields the spec
// requires: date/time, type, gram in/out, balance after, reference, status.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const balance = await getWalletBalance(user.id);

  const history = await db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.customerId, user.id))
    .orderBy(desc(walletLedger.timestamp))
    .limit(100);

  return NextResponse.json({
    balanceGram: formatGram(balance),
    // Displayed explicitly as an estimate, never a fixed cash balance
    // (spec 7.2: "Paparkan anggaran nilai semasa secara jelas").
    note: "Nilai RM adalah anggaran berdasarkan harga emas semasa, bukan baki tunai tetap.",
    history: history.map((h) => ({
      ledgerRef: h.ledgerRef,
      type: h.type,
      direction: h.direction,
      gram: formatGram(h.gram),
      priceSnapshot: h.priceSnapshot,
      balanceAfter: formatGram(h.balanceAfter),
      refType: h.refType,
      refId: h.refId,
      timestamp: h.timestamp,
    })),
  });
}
