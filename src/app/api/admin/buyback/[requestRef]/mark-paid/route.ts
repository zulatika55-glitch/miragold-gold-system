import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { buybackRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toDecimal } from "@/lib/decimal";

// Spec section 11 — Fasa 2A payout is a manual bank transfer. This route
// only RECORDS that a staff member has done the transfer; it deliberately
// does NOT touch the ledger or release the hold yet (that only happens at
// /complete) — matching spec section 13's 5 distinct statuses and section
// 19's separate "Paid twice" vs "Complete twice" idempotency rules.
const bodySchema = z.object({
  payoutReference: z.string().min(1).max(128),
  payoutAmountPaid: z.number().positive(),
  payoutDate: z.string().datetime().optional(), // defaults to now if omitted
  payoutNote: z.string().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ requestRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { requestRef } = await params;
  const [before] = await db.select().from(buybackRequests).where(eq(buybackRequests.requestRef, requestRef)).limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(buybackRequests)
    .set({
      status: "PAID",
      payoutDate: parsed.data.payoutDate ? new Date(parsed.data.payoutDate) : new Date(),
      payoutReference: parsed.data.payoutReference,
      payoutAmountPaid: toDecimal(parsed.data.payoutAmountPaid).toFixed(6),
      payoutProcessedBy: actor.id,
      payoutNote: parsed.data.payoutNote ?? null,
      updatedAt: new Date(),
    })
    // Idempotency (spec 19: "Admin tekan Paid...dua kali tak boleh deduct
    // dua kali") — the WHERE clause only matches while still PROCESSING, so
    // a second click (already PAID) matches zero rows and is rejected.
    .where(and(eq(buybackRequests.id, before.id), eq(buybackRequests.status, "PROCESSING")))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: `Permohonan pada status ${before.status}, bukan PROCESSING — payout tidak boleh direkod` },
      { status: 409 },
    );
  }

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "BUYBACK_PAYOUT_RECORDED",
    entity: "buyback_requests",
    entityId: updated.id,
    before,
    after: updated,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
