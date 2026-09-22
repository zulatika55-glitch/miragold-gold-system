import { NextResponse } from "next/server";
import { db } from "@/db";
import { buybackRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { postLedgerEntry } from "@/lib/wallet";
import { writeAuditLog } from "@/lib/audit";

// Spec section 12 — the ONLY point gram actually leaves the customer's
// wallet. Everything before this (hold placed at creation, reviewed,
// marked paid) is reversible/no-op-safe; this step posts the irreversible
// BUYBACK ledger entry, so it gets its own idempotency guard on top of
// postLedgerEntry's own row-lock + balance check (spec 19: "Admin tekan
// ... Complete dua kali tak boleh deduct dua kali").
export async function POST(req: Request, { params }: { params: Promise<{ requestRef: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestRef } = await params;
  const [before] = await db.select().from(buybackRequests).where(eq(buybackRequests.requestRef, requestRef)).limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (before.status !== "PAID") {
    return NextResponse.json(
      { error: `Permohonan pada status ${before.status}, bukan PAID — tidak boleh Complete` },
      { status: 409 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Claim the row FIRST, inside the same transaction as the ledger
      // write, so a concurrent double-click on Complete can only win this
      // update once — the second call's WHERE matches zero rows before it
      // ever reaches postLedgerEntry.
      const [claimed] = await tx
        .update(buybackRequests)
        .set({ status: "COMPLETED", completedBy: actor.id, completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(buybackRequests.id, before.id), eq(buybackRequests.status, "PAID")))
        .returning();

      if (!claimed) {
        throw new Error("ALREADY_COMPLETED");
      }

      const ledgerEntry = await postLedgerEntry(tx, {
        customerId: claimed.customerId,
        type: "BUYBACK",
        direction: "OUT",
        gram: claimed.gram,
        priceSnapshot: claimed.buybackPriceSnapshot,
        refType: "BUYBACK",
        refId: claimed.requestRef,
        createdBy: actor.id,
      });

      const [final] = await tx
        .update(buybackRequests)
        .set({ ledgerEntryId: ledgerEntry.id, updatedAt: new Date() })
        .where(eq(buybackRequests.id, claimed.id))
        .returning();

      await writeAuditLog(tx, {
        actorId: actor.id,
        actorType: actor.role as "ADMIN" | "OWNER",
        action: "BUYBACK_COMPLETED",
        entity: "buyback_requests",
        entityId: final.id,
        before,
        after: final,
        reason: `Ledger entry ${ledgerEntry.ledgerRef} posted — gram deducted, hold released`,
      });

      return final;
    });

    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_COMPLETED") {
      return NextResponse.json({ error: "Permohonan ini sudah Completed" }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menyelesaikan permohonan" },
      { status: 400 },
    );
  }
}
