import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { goldPrices } from "@/db/schema";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toDecimal } from "@/lib/decimal";
import { desc } from "drizzle-orm";

const bodySchema = z.object({
  sellPrice916: z.number().positive(),
  buybackPrice916: z.number().positive(),
});

// Module 10 / spec 4.5: "Admin hanya update harga 1g; sistem auto-calculate
// RM100 equivalent." Every change is timestamped + audit logged (4.6, 13).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminOrAbove(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sellPrice916, buybackPrice916 } = parsed.data;

  // Loophole 16.6: "Wrong admin price -> unusual-change warning + optional
  // approval threshold." V1: warn (still allow) if the change is >10% from
  // the last price, so an admin fat-finger doesn't silently go live.
  const [previous] = await db.select().from(goldPrices).orderBy(desc(goldPrices.effectiveAt)).limit(1);
  let warning: string | null = null;
  if (previous) {
    const prevPrice = toDecimal(previous.sellPrice916);
    const changeRatio = toDecimal(sellPrice916).minus(prevPrice).abs().dividedBy(prevPrice);
    if (changeRatio.gt(0.1)) {
      warning = `New sell price differs from previous by more than 10% (previous: RM${prevPrice.toFixed(2)}). Confirm this is intentional.`;
    }
  }

  const [created] = await db
    .insert(goldPrices)
    .values({
      sellPrice916: sellPrice916.toFixed(6),
      buybackPrice916: buybackPrice916.toFixed(6),
      createdBy: user.id,
    })
    .returning();

  await writeAuditLog(db, {
    actorId: user.id,
    actorType: user.role as "ADMIN" | "OWNER",
    action: "PRICE_UPDATE",
    entity: "gold_prices",
    entityId: created.id,
    before: previous ?? null,
    after: created,
  });

  return NextResponse.json({ price: created, warning });
}
