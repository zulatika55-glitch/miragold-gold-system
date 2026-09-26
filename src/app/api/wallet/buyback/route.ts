import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { goldPrices, buybackRequests } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getAvailableGold, expireStaleHolds, lockCustomerRow } from "@/lib/wallet";
import { Decimal, toDecimal, formatGram, formatRm, GRAM_STORAGE_DECIMALS } from "@/lib/decimal";
import { newBuybackRef } from "@/lib/refs";
import { requestOtp } from "@/lib/otp";
import { writeAuditLog } from "@/lib/audit";
import { BUYBACK_OTP_EXPIRY_MINUTES, BUYBACK_MIN_GRAM } from "@/lib/buyback";

// Fasa 2A — Module 06 (Jual Balik Emas). Customer's own request history
// (mirrors GET /api/orders for the buy side): every attempt, not just
// completed ones, so a rejected/expired request is still visible.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  await expireStaleHolds(db, user.id);

  const rows = await db
    .select()
    .from(buybackRequests)
    .where(eq(buybackRequests.customerId, user.id))
    .orderBy(desc(buybackRequests.createdAt))
    .limit(100);

  return NextResponse.json({
    requests: rows.map((r) => ({
      requestRef: r.requestRef,
      createdAt: r.createdAt,
      gram: formatGram(r.gram),
      buybackPriceSnapshot: formatRm(r.buybackPriceSnapshot),
      payoutAmountRm: formatRm(r.payoutAmountRm),
      status: r.status,
      otpExpiresAt: r.otpExpiresAt,
      payoutDate: r.payoutDate,
      payoutReference: r.payoutReference,
      rejectReason: r.rejectReason,
    })),
  });
}

const bodySchema = z
  .object({
    gram: z.number().positive().optional(),
    sellAll: z.boolean().optional(),
    confirmBankDetails: z.literal(true, "Sila sahkan maklumat akaun bank adalah betul"),
  })
  .refine((v) => (v.gram != null) !== !!v.sellAll, {
    message: "Sertakan sama ada gram ATAU sellAll, bukan kedua-dua atau tiada satu pun",
  });

// Spec section 3-7: customer picks a gram amount or "Jual Semua", previews
// the payout, then confirms — at which point price + gram are LOCKED and
// the gram goes ON HOLD immediately (before OTP), so two devices racing for
// the same gram can't both succeed (Fasa 2A UAT section 20).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: `Account is ${user.status}` }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Bank details must exist before a customer can even attempt a sell.
  if (!user.bankName || !user.bankAccountNumber || !user.bankAccountHolderName) {
    return NextResponse.json(
      { error: "Sila tambah maklumat akaun bank anda di Profil Saya sebelum Jual Emas." },
      { status: 422 },
    );
  }

  // Default policy (sir zul, 22/9): bank account holder name MUST match the
  // Gold Wallet holder's name. A mismatch blocks self-service entirely —
  // this protects both the customer and Miragold from an unauthorized
  // payout destination. No override here; the customer must go through
  // Miragold support to resolve it (see /account bank section).
  const nameMatches = user.bankAccountHolderName.trim().toLowerCase() === user.name.trim().toLowerCase();
  if (!nameMatches) {
    return NextResponse.json(
      {
        error:
          "Nama pemegang akaun bank tidak sepadan dengan nama Gold Wallet anda. Sila hubungi Miragold untuk verification/manual review sebelum Jual Emas.",
      },
      { status: 403 },
    );
  }

  const [latestPrice] = await db.select().from(goldPrices).orderBy(desc(goldPrices.effectiveAt)).limit(1);
  if (!latestPrice) {
    return NextResponse.json({ error: "Harga emas tidak tersedia buat masa ini" }, { status: 503 });
  }

  try {
    const created = await db.transaction(async (tx) => {
      // Row-lock first (same lock postLedgerEntry uses) so this serializes
      // against any concurrent buyback creation OR ledger-affecting write
      // for this same customer — the core defence against the "two
      // browsers, same gram" UAT scenario.
      await lockCustomerRow(tx, user.id);
      // Also releases any stale Fasa 2B redemption hold, and getAvailableGold
      // below already nets out any STILL-active redemption hold too — so a
      // customer can never sell gram that's on hold for a Tebus Barang Kemas
      // quotation (Fasa 2B spec section 22 / UAT case O).
      await expireStaleHolds(tx, user.id);

      const available = await getAvailableGold(user.id, tx);

      const gram = parsed.data.sellAll
        ? available
        : toDecimal(parsed.data.gram!).toDecimalPlaces(GRAM_STORAGE_DECIMALS, Decimal.ROUND_DOWN);

      if (gram.lt(BUYBACK_MIN_GRAM)) {
        throw new Error(`Jumlah minimum jual adalah ${BUYBACK_MIN_GRAM}g`);
      }
      if (gram.gt(available)) {
        throw new Error(`Jumlah melebihi baki tersedia (${formatGram(available)}g)`);
      }

      const payoutAmountRm = gram.times(latestPrice.buybackPrice916);
      const otpExpiresAt = new Date(Date.now() + BUYBACK_OTP_EXPIRY_MINUTES * 60_000);

      const [row] = await tx
        .insert(buybackRequests)
        .values({
          requestRef: newBuybackRef(),
          customerId: user.id,
          gram: gram.toFixed(GRAM_STORAGE_DECIMALS),
          buybackPriceSnapshot: latestPrice.buybackPrice916,
          payoutAmountRm: payoutAmountRm.toFixed(6),
          goldPriceId: latestPrice.id,
          status: "PENDING_CONFIRMATION",
          otpExpiresAt,
          bankName: user.bankName!,
          bankAccountNumber: user.bankAccountNumber!,
          bankAccountHolderName: user.bankAccountHolderName!,
          bankConfirmedByCustomer: true,
        })
        .returning();

      await writeAuditLog(tx, {
        actorId: user.id,
        actorType: "CUSTOMER",
        action: "BUYBACK_REQUEST_CREATED",
        entity: "buyback_requests",
        entityId: row.id,
        after: row,
        reason: "Price locked and gram placed on hold at customer confirmation",
      });

      return row;
    });

    // OTP sent AFTER the DB transaction commits — no point holding gram and
    // then failing to even send the code because of an SMS/email hiccup;
    // the request still exists and the customer can request another OTP.
    await requestOtp(user.phone);

    return NextResponse.json({
      request: {
        requestRef: created.requestRef,
        gram: formatGram(created.gram),
        buybackPriceSnapshot: formatRm(created.buybackPriceSnapshot),
        payoutAmountRm: formatRm(created.payoutAmountRm),
        status: created.status,
        otpExpiresAt: created.otpExpiresAt,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat permohonan" }, { status: 400 });
  }
}
