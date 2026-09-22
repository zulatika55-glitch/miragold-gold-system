import { NextResponse } from "next/server";
import { db } from "@/db";
import { buybackRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

// Spec section 10 — the "no problem" path through admin review: ON_HOLD
// (customer confirmed, awaiting review) -> PROCESSING (Miragold accepted,
// preparing the manual bank transfer). Gram stays on hold throughout.
export async function POST(req: Request, { params }: { params: Promise<{ requestRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestRef } = await params;
  const [before] = await db.select().from(buybackRequests).where(eq(buybackRequests.requestRef, requestRef)).limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(buybackRequests)
    .set({ status: "PROCESSING", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(buybackRequests.id, before.id), eq(buybackRequests.status, "ON_HOLD")))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: `Permohonan ini pada status ${before.status}, bukan ON_HOLD` }, { status: 409 });
  }

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "BUYBACK_APPROVED",
    entity: "buyback_requests",
    entityId: updated.id,
    before,
    after: updated,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
