import { NextResponse } from "next/server";
import { db } from "@/db";
import { buybackRequests, users } from "@/db/schema";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { expireStaleHolds } from "@/lib/wallet";
import { Decimal, formatGram, formatRm, GRAM_LIABILITY_DECIMALS } from "@/lib/decimal";

// Fasa 2A spec section 8 (Buyback Requests menu) + section 17 (Admin
// Dashboard summary). One route backs both the list/filter table and the
// summary cards so they're always counted from the same query.
export async function GET(req: Request) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await expireStaleHolds(db);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q"); // customer name/phone/customerId or request ref
  const dateFrom = url.searchParams.get("from");
  const dateTo = url.searchParams.get("to");

  const BUYBACK_STATUSES = [
    "PENDING_CONFIRMATION",
    "ON_HOLD",
    "PROCESSING",
    "PAID",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ] as const;
  const statusFilter = BUYBACK_STATUSES.find((s) => s === status);

  const conditions: SQL[] = [];
  // Admin's default queue is what's actually actionable — PENDING_CONFIRMATION
  // rows are pre-OTP and not yet a real submission (spec section 6/8).
  conditions.push(statusFilter ? eq(buybackRequests.status, statusFilter) : sql`${buybackRequests.status} != 'PENDING_CONFIRMATION'`);
  if (q) {
    const searchCondition = or(
      ilike(users.name, `%${q}%`),
      ilike(users.phone, `%${q}%`),
      ilike(users.customerId, `%${q}%`),
      ilike(buybackRequests.requestRef, `%${q}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (dateFrom) conditions.push(gte(buybackRequests.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(buybackRequests.createdAt, new Date(dateTo)));

  const rows = await db
    .select({
      requestRef: buybackRequests.requestRef,
      createdAt: buybackRequests.createdAt,
      gram: buybackRequests.gram,
      buybackPriceSnapshot: buybackRequests.buybackPriceSnapshot,
      payoutAmountRm: buybackRequests.payoutAmountRm,
      status: buybackRequests.status,
      bankName: buybackRequests.bankName,
      bankAccountNumber: buybackRequests.bankAccountNumber,
      bankAccountHolderName: buybackRequests.bankAccountHolderName,
      customerName: users.name,
      customerPhone: users.phone,
      customerId: users.customerId,
    })
    .from(buybackRequests)
    .innerJoin(users, eq(buybackRequests.customerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(buybackRequests.createdAt))
    .limit(200);

  // Summary counts (spec section 17) — computed across ALL requests, not
  // just the current filtered/limited page, so the cards stay stable while
  // an admin searches/filters the table below them.
  const summaryRows = await db
    .select({ status: buybackRequests.status, n: sql<number>`count(*)::int` })
    .from(buybackRequests)
    .groupBy(buybackRequests.status);
  const countsByStatus = Object.fromEntries(summaryRows.map((r) => [r.status, r.n]));

  const [[gramOnHoldRow]] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${buybackRequests.gram}), 0)` })
      .from(buybackRequests)
      .where(sql`${buybackRequests.status} IN ('PENDING_CONFIRMATION','ON_HOLD','PROCESSING','PAID')`),
  ]);

  return NextResponse.json({
    requests: rows.map((r) => ({
      ...r,
      gram: formatGram(r.gram),
      buybackPriceSnapshot: formatRm(r.buybackPriceSnapshot),
      payoutAmountRm: formatRm(r.payoutAmountRm),
      bankAccountNumberMasked: maskAccount(r.bankAccountNumber),
    })),
    summary: {
      onHold: formatGram(new Decimal(gramOnHoldRow?.total ?? "0"), GRAM_LIABILITY_DECIMALS),
      pendingConfirmation: countsByStatus["PENDING_CONFIRMATION"] ?? 0,
      onHoldCount: countsByStatus["ON_HOLD"] ?? 0,
      processing: countsByStatus["PROCESSING"] ?? 0,
      payoutPending: countsByStatus["PAID"] ?? 0,
      completed: countsByStatus["COMPLETED"] ?? 0,
      rejected: (countsByStatus["REJECTED"] ?? 0) + (countsByStatus["CANCELLED"] ?? 0),
    },
  });
}

function maskAccount(num: string): string {
  const digits = num.replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
