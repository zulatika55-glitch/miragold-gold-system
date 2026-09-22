import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { buybackRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { verifyOtp } from "@/lib/otp";
import { writeAuditLog } from "@/lib/audit";
import { formatGram, formatRm } from "@/lib/decimal";

const bodySchema = z.object({ otpCode: z.string().length(6) });

// Fasa 2A spec section 6 — OTP verification for a sensitive transaction.
// The gram has already been on hold since creation (PENDING_CONFIRMATION
// counts as an active hold — see ACTIVE_HOLD_STATUSES in wallet.ts), so
// this step doesn't move any gram; it just confirms the customer really is
// who they say they are before the request becomes visible/actionable to
// admin (ON_HOLD).
export async function POST(req: Request, { params }: { params: Promise<{ requestRef: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { requestRef } = await params;
  const [row] = await db.select().from(buybackRequests).where(eq(buybackRequests.requestRef, requestRef)).limit(1);

  if (!row || row.customerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== "PENDING_CONFIRMATION") {
    return NextResponse.json({ error: `Permohonan ini sudah pada status ${row.status}` }, { status: 409 });
  }
  if (row.otpExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Tempoh OTP telah tamat. Sila mula semula permohonan Jual Emas." }, { status: 410 });
  }

  const otpOk = await verifyOtp(user.phone, parsed.data.otpCode);
  if (!otpOk) {
    return NextResponse.json({ error: "Kod OTP tidak sah atau telah luput" }, { status: 401 });
  }

  // Idempotency guard: only flip PENDING_CONFIRMATION -> ON_HOLD once, even
  // if this route is somehow called twice in a race (the WHERE clause
  // matches zero rows on the second call).
  const [updated] = await db
    .update(buybackRequests)
    .set({ status: "ON_HOLD", confirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(buybackRequests.id, row.id), eq(buybackRequests.status, "PENDING_CONFIRMATION")))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Permohonan ini sudah disahkan" }, { status: 409 });
  }

  await writeAuditLog(db, {
    actorId: user.id,
    actorType: "CUSTOMER",
    action: "BUYBACK_OTP_CONFIRMED",
    entity: "buyback_requests",
    entityId: updated.id,
    before: row,
    after: updated,
  });

  return NextResponse.json({
    ok: true,
    request: {
      requestRef: updated.requestRef,
      gram: formatGram(updated.gram),
      buybackPriceSnapshot: formatRm(updated.buybackPriceSnapshot),
      payoutAmountRm: formatRm(updated.payoutAmountRm),
      status: updated.status,
    },
  });
}
