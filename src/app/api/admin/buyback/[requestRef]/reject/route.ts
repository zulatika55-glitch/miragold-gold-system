import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { buybackRequests } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({ reason: z.string().min(5).max(1000) });

// Spec section 10: "Jika ada masalah, gunakan: Reject / Cancel + Reason.
// Jangan edit transaksi asal." — the locked gram/price row itself is never
// touched; only status + reason change. Section 12: "Jika rejected: Gold On
// Hold -> Available Gold" happens automatically here since REJECTED/
// CANCELLED are not in ACTIVE_HOLD_STATUSES (wallet.ts) — no ledger entry
// is ever posted for a rejected request, so there is nothing to reverse.
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
      status: "REJECTED",
      rejectReason: parsed.data.reason,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(buybackRequests.id, before.id), inArray(buybackRequests.status, ["ON_HOLD", "PROCESSING"])))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: `Permohonan pada status ${before.status} tidak boleh ditolak dari sini` },
      { status: 409 },
    );
  }

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "BUYBACK_REJECTED",
    entity: "buyback_requests",
    entityId: updated.id,
    before,
    after: updated,
    reason: parsed.data.reason,
  });
  await writeAuditLog(db, {
    actorType: "SYSTEM",
    action: "BUYBACK_HOLD_RELEASED",
    entity: "buyback_requests",
    entityId: updated.id,
    reason: "Request rejected — gram returned to Available Gold",
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
