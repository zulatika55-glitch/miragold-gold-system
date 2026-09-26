import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({ reason: z.string().min(5).max(1000) });

// Spec section 15 exceptions + section 18: staff can back out of a
// redemption at any point before it's actually completed. The locked
// gram/price row is never touched — only status + reason change — and
// because CANCELLED isn't in REDEMPTION_ACTIVE_HOLD_STATUSES (wallet.ts),
// any hold this redemption was holding is released automatically, with no
// ledger entry ever having been posted for it (spec: "Cancel Redemption ->
// Release Gold Hold -> Available Gold dipulihkan").
export async function POST(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { redemptionRef } = await params;
  const [before] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const CANCELLABLE_STATUSES = [
    "AWAITING_CUSTOMER_CONFIRMATION",
    "PENDING_CONFIRMATION",
    "AWAITING_PAYMENT",
    "PAYMENT_CONFIRMED",
    "PROCESSING",
    "READY_FOR_FULFILLMENT",
  ] as const;

  const [updated] = await db
    .update(redemptions)
    .set({
      status: "CANCELLED",
      cancelReason: parsed.data.reason,
      cancelledBy: actor.id,
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(redemptions.id, before.id), inArray(redemptions.status, CANCELLABLE_STATUSES)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: `Redemption pada status ${before.status} tidak boleh dibatalkan dari sini` }, { status: 409 });
  }

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "REDEMPTION_CANCELLED",
    entity: "redemptions",
    entityId: updated.id,
    before,
    after: updated,
    reason: parsed.data.reason,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
