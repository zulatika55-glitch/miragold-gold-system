import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, walletLedger } from "@/db/schema";
import { desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { postLedgerEntry } from "@/lib/wallet";
import { formatGram, toDecimal } from "@/lib/decimal";
import { writeAuditLog } from "@/lib/audit";
import { phoneLookupCandidates } from "@/lib/phone";

// Spec 13 (Audit & Security): staff/admin must never edit a customer's
// gram balance directly — the ONLY way to correct a balance is a
// controlled ADJUSTMENT ledger entry with a mandatory reason and an
// approver, which postLedgerEntry() already enforces at the data layer.
// This route is the (ADMIN/OWNER-only) front door to that capability.

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      ledgerRef: walletLedger.ledgerRef,
      direction: walletLedger.direction,
      gram: walletLedger.gram,
      reason: walletLedger.reason,
      timestamp: walletLedger.timestamp,
      customerName: users.name,
      customerId: users.customerId,
    })
    .from(walletLedger)
    .innerJoin(users, eq(walletLedger.customerId, users.id))
    .where(eq(walletLedger.type, "ADJUSTMENT"))
    .orderBy(desc(walletLedger.timestamp))
    .limit(100);

  return NextResponse.json({
    adjustments: rows.map((r) => ({ ...r, gram: formatGram(r.gram) })),
  });
}

const bodySchema = z.object({
  customerQuery: z.string().min(3).max(255), // phone or Customer ID
  direction: z.enum(["IN", "OUT"]),
  gram: z.number().positive(),
  reason: z.string().min(10).max(1000),
});

export async function POST(req: Request) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { customerQuery, direction, gram, reason } = parsed.data;

  // Found during Fasa 2A UAT (sir zul, 26/9): an exact phone match missed a
  // real account because `users.phone` for some accounts predates
  // normalization and isn't stored as +60XXXXXXXXX. Matching every
  // representation (like the login/OTP lookups already do) means an admin
  // searching by phone doesn't get a false "Customer not found".
  const [target] = await db
    .select()
    .from(users)
    .where(or(inArray(users.phone, phoneLookupCandidates(customerQuery)), ilike(users.customerId, customerQuery)))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "Customer not found (search by exact phone or Customer ID)" }, { status: 404 });
  }

  try {
    const entry = await db.transaction(async (tx) => {
      const created = await postLedgerEntry(tx, {
        customerId: target.id,
        type: "ADJUSTMENT",
        direction,
        gram: toDecimal(gram),
        refType: "ADJUSTMENT",
        refId: newAdjustmentRef(),
        reason,
        createdBy: actor.id,
        approvedBy: actor.id,
      });

      await writeAuditLog(tx, {
        actorId: actor.id,
        actorType: actor.role as "ADMIN" | "OWNER",
        action: "WALLET_ADJUSTMENT",
        entity: "wallet_ledger",
        entityId: created.id,
        after: created,
        reason,
      });

      return created;
    });

    return NextResponse.json({ ok: true, adjustment: entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Adjustment failed" },
      { status: 400 },
    );
  }
}

function newAdjustmentRef(): string {
  // Local helper so this route doesn't need a new ref "kind" in refs.ts
  // just for adjustments; ADJ-<timestamp>-<random> is unique enough and
  // human-legible in the ledger/audit log.
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ADJ-${Date.now()}-${rand}`;
}
