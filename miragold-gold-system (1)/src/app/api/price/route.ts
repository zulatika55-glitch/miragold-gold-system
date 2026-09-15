import { NextResponse } from "next/server";
import { db } from "@/db";
import { goldPrices } from "@/db/schema";
import { desc } from "drizzle-orm";
import { calcDisplayGramForAmount, formatRm } from "@/lib/decimal";

// Module 01 — Public Home & Daily Gold Price. No login required.
export async function GET() {
  const [latest] = await db.select().from(goldPrices).orderBy(desc(goldPrices.effectiveAt)).limit(1);

  if (!latest) {
    return NextResponse.json({ error: "No gold price has been set yet" }, { status: 404 });
  }

  return NextResponse.json({
    sellPrice916: formatRm(latest.sellPrice916),
    buybackPrice916: formatRm(latest.buybackPrice916),
    rm100Equivalent: calcDisplayGramForAmount(100, latest.sellPrice916),
    minimumAmountRm: "100.00",
    effectiveAt: latest.effectiveAt,
  });
}
