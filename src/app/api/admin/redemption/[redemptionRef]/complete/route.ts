import { NextResponse } from "next/server";
import { db } from "@/db";
import { redemptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { postLedgerEntry } from "@/lib/wallet";
import { writeAuditLog } from "@/lib/audit";
import { toDecimal } from "@/lib/decimal";

// Spec section 17 — the ONLY point gram actually leaves the customer's
// wallet, mirroring Buyback's /complete exactly: claim the row FIRST inside
// the same transaction as the ledger write, so a double-click can only win
// once (spec 22: "Admin tekan Complete dua kali tak boleh create ledger dua
// kali"). A redemption with gramUsed = 0 (spec UAT case E — wallet was
// empty, this was really a plain RM purchase of the item) skips the ledger
// entry entirely: postLedgerEntry requires a positive gram, and there is
// nothing to deduct from the wallet in that case.
export async function POST(req: Request, { params }: { params: Promise<{ redemptionRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { redemptionRef } = await params;
  const [before] = await db.select().from(redemptions).where(eq(redemptions.redemptionRef, redemptionRef)).limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (before.status !== "READY_FOR_FULFILLMENT") {
    return NextResponse.json(
      { error: `Redemption pada status ${before.status}, bukan READY_FOR_FULFILLMENT — tidak boleh Complete` },
      { status: 409 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(redemptions)
        .set({ status: "COMPLETED", completedBy: actor.id, completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(redemptions.id, before.id), eq(redemptions.status, "READY_FOR_FULFILLMENT")))
        .returning();

      if (!claimed) {
        throw new Error("ALREADY_COMPLETED");
      }

      let ledgerEntryId: string | null = null;
      if (toDecimal(claimed.gramUsed).gt(0)) {
        const ledgerEntry = await postLedgerEntry(tx, {
          customerId: claimed.customerId,
          type: "REDEMPTION",
          direction: "OUT",
          gram: claimed.gramUsed,
          priceSnapshot: claimed.sellPriceSnapshot,
          refType: "REDEMPTION",
          refId: claimed.redemptionRef,
          createdBy: actor.id,
        });
        ledgerEntryId = ledgerEntry.id;

        await tx.update(redemptions).set({ ledgerEntryId, updatedAt: new Date() }).where(eq(redemptions.id, claimed.id));
      }

      const [final] = await tx.select().from(redemptions).where(eq(redemptions.id, claimed.id)).limit(1);

      await writeAuditLog(tx, {
        actorId: actor.id,
        actorType: actor.role as "ADMIN" | "OWNER",
        action: "REDEMPTION_COMPLETED",
        entity: "redemptions",
        entityId: final.id,
        before,
        after: final,
        reason: ledgerEntryId
          ? `Ledger entry posted — ${claimed.gramUsed}g deducted, hold released`
          : "No Gold Wallet gram used for this redemption — nothing to deduct from the ledger",
      });

      return final;
    });

    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_COMPLETED") {
      return NextResponse.json({ error: "Redemption ini sudah Completed" }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menyelesaikan redemption" },
      { status: 400 },
    );
  }
}
