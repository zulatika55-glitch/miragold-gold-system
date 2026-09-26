import { NextResponse } from "next/server";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { expireStaleHolds, getAvailableGold, lockCustomerRow } from "@/lib/wallet";
import { toDecimal, formatGram } from "@/lib/decimal";
import { requestOtp } from "@/lib/otp";
import { writeAuditLog } from "@/lib/audit";
import { REDEMPTION_OTP_EXPIRY_MINUTES } from "@/lib/redemption";

// Spec section 9-10: the moment the customer taps "Sahkan Tebusan", gramUsed
// is placed ON HOLD (row-locked, same defence buyback uses against "two
// devices, same gram" — spec section 22 / UAT cases K & L) and an OTP is
// sent. Re-validates gramUsed against the customer's CURRENT Available Gold
// here — it could have changed since they last viewed this quotation (e.g.
// spent on a Buyback in the meantime) — rather than trusting a stale figure.
export async function POST(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: `Account is ${user.status}` }, { status: 403 });
  }

  const { redemptionRef } = await params;
  const [row] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!row || row.customerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== "AWAITING_CUSTOMER_CONFIRMATION") {
    return NextResponse.json({ error: `Redemption ini pada status ${row.status}` }, { status: 409 });
  }

  try {
    const updated = await db.transaction(async (tx) => {
      await lockCustomerRow(tx, user.id);
      await expireStaleHolds(tx, user.id);

      const available = await getAvailableGold(user.id, tx);
      if (toDecimal(row.gramUsed).gt(available)) {
        throw new Error(
          `Baki emas tersedia anda telah berubah. Sila kemaskini gram digunakan (baki tersedia: ${formatGram(available)}g)`,
        );
      }

      const otpExpiresAt = new Date(Date.now() + REDEMPTION_OTP_EXPIRY_MINUTES * 60_000);

      const [u] = await tx
        .update(redemptions)
        .set({ status: "PENDING_CONFIRMATION", otpExpiresAt, updatedAt: new Date() })
        .where(and(eq(redemptions.id, row.id), eq(redemptions.status, "AWAITING_CUSTOMER_CONFIRMATION")))
        .returning();

      if (!u) throw new Error("Redemption ini sedang diproses, sila muat semula");

      await writeAuditLog(tx, {
        actorId: user.id,
        actorType: "CUSTOMER",
        action: "REDEMPTION_CONFIRM_STARTED",
        entity: "redemptions",
        entityId: u.id,
        after: u,
        reason: "Gram placed on hold pending OTP confirmation",
      });

      return u;
    });

    // OTP sent AFTER the transaction commits, same reasoning as buyback: no
    // point holding gram and then failing on an SMS/email hiccup — the
    // customer can request another code, the hold already exists.
    await requestOtp(user.phone);

    return NextResponse.json({ ok: true, otpExpiresAt: updated.otpExpiresAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memulakan pengesahan" }, { status: 400 });
  }
}
