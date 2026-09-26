import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({ deliveryTrackingReference: z.string().max(128).optional() });

// Spec section 15/16: PROCESSING -> READY_FOR_FULFILLMENT — item prepared,
// ready for the customer to pick up or for delivery to be dispatched. Gram
// remains on hold until the actual handover is confirmed at /complete
// (spec section 17 — final deduction only then).
export async function POST(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { redemptionRef } = await params;
  const [before] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(redemptions)
    .set({
      status: "READY_FOR_FULFILLMENT",
      readyBy: actor.id,
      readyAt: new Date(),
      deliveryTrackingReference: parsed.data.deliveryTrackingReference ?? before.deliveryTrackingReference,
      updatedAt: new Date(),
    })
    .where(and(eq(redemptions.id, before.id), eq(redemptions.status, "PROCESSING")))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: `Redemption pada status ${before.status}, bukan PROCESSING` }, { status: 409 });
  }

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "REDEMPTION_READY",
    entity: "redemptions",
    entityId: updated.id,
    before,
    after: updated,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
