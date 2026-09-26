import { NextResponse } from "next/server";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

// Spec section 15: PAYMENT_CONFIRMED -> PROCESSING — staff acknowledges the
// shortfall payment (confirmed by the Billplz webhook) and begins physically
// preparing the item. Gram stays on hold throughout (still in
// REDEMPTION_ACTIVE_HOLD_STATUSES). A pure-gram redemption (no RM shortfall)
// never needs this step — it goes straight to PROCESSING at OTP confirmation
// (spec section 13's RM0 case).
export async function POST(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { redemptionRef } = await params;
  const [before] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(redemptions)
    .set({ status: "PROCESSING", processedBy: actor.id, processedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(redemptions.id, before.id), eq(redemptions.status, "PAYMENT_CONFIRMED")))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: `Redemption pada status ${before.status}, bukan PAYMENT_CONFIRMED` },
      { status: 409 },
    );
  }

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "REDEMPTION_PROCESSING",
    entity: "redemptions",
    entityId: updated.id,
    before,
    after: updated,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
