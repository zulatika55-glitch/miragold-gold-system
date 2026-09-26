import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { upahRates } from "@/db/schema";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { desc } from "drizzle-orm";

const bodySchema = z.object({ ratePerGram: z.number().min(0) });

// Fasa 2B spec section 7: "Jangan hardcode RM60/g dalam source code. Sistem
// perlu benarkan admin masukkan/setting upah kerana kadar Miragold mungkin
// berubah." Versioned exactly like gold_prices (src/app/api/admin/price)
// so a redemption created under an old rate keeps that rate in its own
// audit trail even after this changes (redemptions.upahRatePerGramSnapshot).
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminOrAbove(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.select().from(upahRates).orderBy(desc(upahRates.effectiveAt)).limit(30);
  return NextResponse.json({ rates: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminOrAbove(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(upahRates)
    .values({ ratePerGram: parsed.data.ratePerGram.toFixed(6), createdBy: user.id })
    .returning();

  await writeAuditLog(db, {
    actorId: user.id,
    actorType: user.role as "ADMIN" | "OWNER",
    action: "UPAH_RATE_UPDATE",
    entity: "upah_rates",
    entityId: created.id,
    after: created,
  });

  return NextResponse.json({ rate: created });
}
