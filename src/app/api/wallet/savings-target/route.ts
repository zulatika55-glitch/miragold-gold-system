import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { savingsTargets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { formatGram, formatRm, toDecimal } from "@/lib/decimal";

// Advanced Dashboard — Fungsi 1 (Sasaran Simpanan Emas) & Fungsi 7 (Pelan
// Simpanan Bulanan). sir zul, 21/10: "Sasaran ini tidak boleh mengubah baki
// wallet sebenar" -- this route only ever reads/writes savings_targets,
// never wallet_ledger, and never calls postLedgerEntry() or any hold logic.
// One row per customer (upsert on customerId's unique constraint).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const [row] = await db.select().from(savingsTargets).where(eq(savingsTargets.customerId, user.id)).limit(1);

  if (!row) {
    return NextResponse.json({ target: null });
  }

  return NextResponse.json({
    target: {
      targetGram: formatGram(row.targetGram, 4),
      monthlyBudgetRm: row.monthlyBudgetRm ? formatRm(row.monthlyBudgetRm) : null,
      updatedAt: row.updatedAt,
    },
  });
}

const bodySchema = z.object({
  targetGram: z.number().positive(),
  monthlyBudgetRm: z.number().positive().nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { targetGram, monthlyBudgetRm } = parsed.data;

  const values = {
    customerId: user.id,
    targetGram: toDecimal(targetGram).toFixed(8),
    monthlyBudgetRm: monthlyBudgetRm != null ? toDecimal(monthlyBudgetRm).toFixed(6) : null,
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(savingsTargets)
    .values(values)
    .onConflictDoUpdate({
      target: savingsTargets.customerId,
      set: { targetGram: values.targetGram, monthlyBudgetRm: values.monthlyBudgetRm, updatedAt: values.updatedAt },
    })
    .returning();

  return NextResponse.json({
    target: {
      targetGram: formatGram(saved.targetGram, 4),
      monthlyBudgetRm: saved.monthlyBudgetRm ? formatRm(saved.monthlyBudgetRm) : null,
      updatedAt: saved.updatedAt,
    },
  });
}
