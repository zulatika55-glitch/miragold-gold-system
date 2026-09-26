import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({ reason: z.string().max(1000).optional() });

// Spec section 18 / UAT case H: the customer themselves can back out of a
// redemption they haven't yet paid for. Once staff has moved it to
// PROCESSING (payment confirmed / item being prepared), self-service cancel
// is no longer offered — the customer contacts Miragold instead, mirroring
// how Buyback routes a bank-mismatch case to manual support rather than
// self-service.
export async function POST(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { redemptionRef } = await params;
  const [row] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!row || row.customerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const CANCELLABLE_BY_CUSTOMER = ["AWAITING_CUSTOMER_CONFIRMATION", "PENDING_CONFIRMATION", "AWAITING_PAYMENT"] as const;

  const [updated] = await db
    .update(redemptions)
    .set({
      status: "CANCELLED",
      cancelReason: parsed.data.reason ?? "Dibatalkan oleh customer",
      cancelledBy: user.id,
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(redemptions.id, row.id), inArray(redemptions.status, CANCELLABLE_BY_CUSTOMER)))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: `Redemption pada status ${row.status} tidak boleh dibatalkan sendiri. Sila hubungi Miragold.` },
      { status: 409 },
    );
  }

  await writeAuditLog(db, {
    actorId: user.id,
    actorType: "CUSTOMER",
    action: "REDEMPTION_CANCELLED",
    entity: "redemptions",
    entityId: updated.id,
    before: row,
    after: updated,
    reason: updated.cancelReason ?? undefined,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
