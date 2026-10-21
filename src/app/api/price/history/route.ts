import { NextResponse } from "next/server";
import { db } from "@/db";
import { goldPrices } from "@/db/schema";
import { desc } from "drizzle-orm";
import { formatRm } from "@/lib/decimal";

// Advanced Dashboard — Fungsi 9 (Sejarah Harga Emas 916). gold_prices is
// append-only (every admin price update is a new row, never an overwrite --
// see src/app/api/admin/price/route.ts), so this is real historical data,
// never generated. Public like /api/price -- gold price itself carries no
// customer data, no login required.
export async function GET() {
  const rows = await db.select().from(goldPrices).orderBy(desc(goldPrices.effectiveAt)).limit(90);

  return NextResponse.json({
    points: rows
      .slice()
      .reverse()
      .map((r) => ({
        effectiveAt: r.effectiveAt,
        sellPrice916: formatRm(r.sellPrice916),
        buybackPrice916: formatRm(r.buybackPrice916),
      })),
  });
}
