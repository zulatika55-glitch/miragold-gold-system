import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { redemptions, users, goldPrices, upahRates } from "@/db/schema";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { getCurrentUser, isAdminOrAbove } from "@/lib/auth";
import { expireStaleHolds, getAvailableGold } from "@/lib/wallet";
import { Decimal, toDecimal, formatGram, formatRm, GRAM_STORAGE_DECIMALS, GRAM_LIABILITY_DECIMALS } from "@/lib/decimal";
import { computeRedemptionAmounts } from "@/lib/redemption";
import { newRedemptionRef } from "@/lib/refs";
import { writeAuditLog } from "@/lib/audit";
import { phoneLookupCandidates } from "@/lib/phone";

// Fasa 2B spec section 8 (menu) + section 20 (Admin Dashboard summary). One
// route backs both the list/filter table and the summary cards, mirroring
// /api/admin/buyback.
export async function GET(req: Request) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await expireStaleHolds(db);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q"); // customer name/phone/customerId, SKU, or redemption ref
  const dateFrom = url.searchParams.get("from");
  const dateTo = url.searchParams.get("to");

  const REDEMPTION_STATUSES = [
    "AWAITING_CUSTOMER_CONFIRMATION",
    "PENDING_CONFIRMATION",
    "AWAITING_PAYMENT",
    "PAYMENT_CONFIRMED",
    "PROCESSING",
    "READY_FOR_FULFILLMENT",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ] as const;
  const statusFilter = REDEMPTION_STATUSES.find((s) => s === status);

  const conditions: SQL[] = [];
  // Default queue is what's actually actionable — a quotation the customer
  // hasn't even started confirming yet isn't a real submission (mirrors
  // buyback's admin list excluding PENDING_CONFIRMATION by default).
  conditions.push(
    statusFilter
      ? eq(redemptions.status, statusFilter)
      : sql`${redemptions.status} NOT IN ('AWAITING_CUSTOMER_CONFIRMATION','PENDING_CONFIRMATION')`,
  );
  if (q) {
    const searchCondition = or(
      ilike(users.name, `%${q}%`),
      ilike(users.phone, `%${q}%`),
      ilike(users.customerId, `%${q}%`),
      ilike(redemptions.redemptionRef, `%${q}%`),
      ilike(redemptions.sku, `%${q}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (dateFrom) conditions.push(gte(redemptions.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(redemptions.createdAt, new Date(dateTo)));

  const rows = await db
    .select({
      redemptionRef: redemptions.redemptionRef,
      createdAt: redemptions.createdAt,
      productName: redemptions.productName,
      sku: redemptions.sku,
      itemWeightGram: redemptions.itemWeightGram,
      gramUsed: redemptions.gramUsed,
      sellPriceSnapshot: redemptions.sellPriceSnapshot,
      upahRm: redemptions.upahRm,
      otherChargesRm: redemptions.otherChargesRm,
      postageRm: redemptions.postageRm,
      deliveryMethod: redemptions.deliveryMethod,
      status: redemptions.status,
      customerName: users.name,
      customerPhone: users.phone,
      customerId: users.customerId,
    })
    .from(redemptions)
    .innerJoin(users, eq(redemptions.customerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(redemptions.createdAt))
    .limit(200);

  const summaryRows = await db
    .select({ status: redemptions.status, n: sql<number>`count(*)::int` })
    .from(redemptions)
    .groupBy(redemptions.status);
  const countsByStatus = Object.fromEntries(summaryRows.map((r) => [r.status, r.n]));

  const [[gramOnHoldRow]] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${redemptions.gramUsed}), 0)` })
      .from(redemptions)
      .where(
        inArray(redemptions.status, [
          "PENDING_CONFIRMATION",
          "AWAITING_PAYMENT",
          "PAYMENT_CONFIRMED",
          "PROCESSING",
          "READY_FOR_FULFILLMENT",
        ]),
      ),
  ]);

  return NextResponse.json({
    redemptions: rows.map((r) => {
      const { shortfallGram, totalPaymentRm } = computeRedemptionAmounts(r);
      return {
        ...r,
        itemWeightGram: formatGram(r.itemWeightGram),
        gramUsed: formatGram(r.gramUsed),
        sellPriceSnapshot: formatRm(r.sellPriceSnapshot),
        shortfallGram: formatGram(shortfallGram),
        totalPaymentRm: formatRm(totalPaymentRm),
      };
    }),
    summary: {
      onHold: formatGram(new Decimal(gramOnHoldRow?.total ?? "0"), GRAM_LIABILITY_DECIMALS),
      awaitingCustomer: (countsByStatus["AWAITING_CUSTOMER_CONFIRMATION"] ?? 0) + (countsByStatus["PENDING_CONFIRMATION"] ?? 0),
      awaitingPayment: (countsByStatus["AWAITING_PAYMENT"] ?? 0) + (countsByStatus["PAYMENT_CONFIRMED"] ?? 0),
      processing: countsByStatus["PROCESSING"] ?? 0,
      readyForFulfillment: countsByStatus["READY_FOR_FULFILLMENT"] ?? 0,
      completed: countsByStatus["COMPLETED"] ?? 0,
      cancelled: (countsByStatus["REJECTED"] ?? 0) + (countsByStatus["CANCELLED"] ?? 0) + (countsByStatus["EXPIRED"] ?? 0),
    },
  });
}

const deliveryDetailsSchema = z
  .object({ address: z.string().max(500).optional(), phone: z.string().max(32).optional(), note: z.string().max(500).optional() })
  .optional();

const createBodySchema = z.object({
  customerQuery: z.string().min(3).max(255), // phone or Customer ID
  productName: z.string().min(1).max(255),
  sku: z.string().min(1).max(64),
  itemWeightGram: z.number().positive(),
  // Explicit upah override (RM). Omit to use itemWeightGram * current
  // upah_rates rate (spec section 7's default path).
  upahRm: z.number().min(0).optional(),
  upahOverrideReason: z.string().min(5).max(1000).optional(),
  otherChargesRm: z.number().min(0).optional(),
  postageRm: z.number().min(0).optional(),
  deliveryMethod: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
  deliveryDetails: deliveryDetailsSchema,
  notes: z.string().max(1000).optional(),
});

// Spec section 2-3: staff picks the customer + enters the REAL unit's SKU
// and weight (never a design estimate), and the system computes the default
// Gold Wallet gram usage right here. Nothing is held yet — see
// AWAITING_CUSTOMER_CONFIRMATION's role in wallet.ts — the customer must
// still review and confirm before any gram is touched.
export async function POST(req: Request) {
  const actor = await getCurrentUser();
  if (!actor || !isAdminOrAbove(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const [target] = await db
    .select()
    .from(users)
    .where(or(inArray(users.phone, phoneLookupCandidates(data.customerQuery)), ilike(users.customerId, data.customerQuery)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Customer not found (search by phone or Customer ID)" }, { status: 404 });
  }

  const [latestPrice] = await db.select().from(goldPrices).orderBy(desc(goldPrices.effectiveAt)).limit(1);
  if (!latestPrice) {
    return NextResponse.json({ error: "Harga emas tidak tersedia buat masa ini" }, { status: 503 });
  }

  await expireStaleHolds(db, target.id);
  const available = await getAvailableGold(target.id);

  const itemWeightGram = toDecimal(data.itemWeightGram).toDecimalPlaces(GRAM_STORAGE_DECIMALS, Decimal.ROUND_DOWN);
  if (itemWeightGram.lte(0)) {
    return NextResponse.json({ error: "Berat barang mesti lebih daripada 0" }, { status: 400 });
  }

  // Default: use as much Gold Wallet gram as possible, up to the item's
  // full weight (spec section 3). If the wallet is empty this naturally
  // comes out to 0g used / full RM shortfall — a plain RM purchase of the
  // item, without any special-casing (spec UAT case E).
  const defaultGramUsed = Decimal.min(itemWeightGram, available.gt(0) ? available : new Decimal(0));

  const [currentRate] = await db.select().from(upahRates).orderBy(desc(upahRates.effectiveAt)).limit(1);

  const upahRatePerGramSnapshot: string | null = currentRate?.ratePerGram ?? null;
  let upahRm: Decimal;
  let upahOverrideReason: string | null = null;

  if (data.upahRm != null) {
    upahRm = toDecimal(data.upahRm);
    const computedDefault = currentRate ? itemWeightGram.times(currentRate.ratePerGram) : null;
    const isOverride = !computedDefault || !computedDefault.equals(upahRm);
    if (isOverride) {
      if (!data.upahOverrideReason) {
        return NextResponse.json(
          { error: "Sila berikan sebab kerana upah berbeza daripada kadar standard (spec section 7)" },
          { status: 400 },
        );
      }
      upahOverrideReason = data.upahOverrideReason;
    }
  } else {
    if (!currentRate) {
      return NextResponse.json(
        { error: "Sila tetapkan Kadar Upah dahulu di Urus Kadar Upah sebelum create redemption." },
        { status: 422 },
      );
    }
    upahRm = itemWeightGram.times(currentRate.ratePerGram);
  }

  const otherChargesRm = toDecimal(data.otherChargesRm ?? 0);
  const postageRm = toDecimal(data.postageRm ?? 0);

  const [created] = await db
    .insert(redemptions)
    .values({
      redemptionRef: newRedemptionRef(),
      customerId: target.id,
      productName: data.productName,
      sku: data.sku,
      itemWeightGram: itemWeightGram.toFixed(GRAM_STORAGE_DECIMALS),
      gramUsed: defaultGramUsed.toFixed(GRAM_STORAGE_DECIMALS),
      sellPriceSnapshot: latestPrice.sellPrice916,
      goldPriceId: latestPrice.id,
      upahRatePerGramSnapshot,
      upahRm: upahRm.toFixed(6),
      upahOverrideReason,
      otherChargesRm: otherChargesRm.toFixed(6),
      postageRm: postageRm.toFixed(6),
      deliveryMethod: data.deliveryMethod,
      deliveryDetails: data.deliveryDetails ?? null,
      status: "AWAITING_CUSTOMER_CONFIRMATION",
      notes: data.notes ?? null,
      createdBy: actor.id,
    })
    .returning();

  await writeAuditLog(db, {
    actorId: actor.id,
    actorType: actor.role as "ADMIN" | "OWNER",
    action: "REDEMPTION_QUOTATION_CREATED",
    entity: "redemptions",
    entityId: created.id,
    after: created,
    reason: "Quotation created — awaiting customer review and confirmation",
  });

  const amounts = computeRedemptionAmounts(created);

  return NextResponse.json({
    redemption: {
      redemptionRef: created.redemptionRef,
      productName: created.productName,
      sku: created.sku,
      itemWeightGram: formatGram(created.itemWeightGram),
      gramUsed: formatGram(created.gramUsed),
      sellPriceSnapshot: formatRm(created.sellPriceSnapshot),
      upahRm: formatRm(created.upahRm),
      otherChargesRm: formatRm(created.otherChargesRm),
      postageRm: formatRm(created.postageRm),
      shortfallGram: formatGram(amounts.shortfallGram),
      totalPaymentRm: formatRm(amounts.totalPaymentRm),
      status: created.status,
    },
  });
}
