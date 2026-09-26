import { Decimal, toDecimal } from "./decimal";

/**
 * Fasa 2B — Module 05 (Tebus Barang Kemas / Jewellery Redemption) shared
 * config + math. Mirrors src/lib/buyback.ts's pattern: timings and formulas
 * live in one place instead of scattered through routes/pages.
 */

// How long a customer has to enter the OTP after tapping "Sahkan Tebusan"
// before the request lazily expires and the gold hold releases (spec
// section 9 — "transaksi sensitif" needs OTP/PIN verification, same role as
// Buyback's BUYBACK_OTP_EXPIRY_MINUTES).
export const REDEMPTION_OTP_EXPIRY_MINUTES = Number(process.env.REDEMPTION_OTP_EXPIRY_MINUTES ?? "5");

// Spec section 12 example: "Harga ini sah selama 15 minit selepas
// pengesahan." — how long the locked shortfall price/quotation stays valid
// for completing payment once OTP has passed. Only relevant when there is
// an RM shortfall to pay — spec section 13's RM0 case skips payment
// entirely, so this window never applies to that path.
export const REDEMPTION_PAYMENT_EXPIRY_MINUTES = Number(process.env.REDEMPTION_PAYMENT_EXPIRY_MINUTES ?? "15");

type RedemptionAmountFields = {
  itemWeightGram: string;
  gramUsed: string;
  sellPriceSnapshot: string;
  upahRm: string;
  otherChargesRm: string;
  postageRm: string;
};

/**
 * Spec section 6's formula, computed live from the locked base fields
 * rather than stored/cached — gramUsed can change (customer adjustment,
 * spec section 4) right up until confirmation, and re-deriving here means
 * every route (list, detail, PATCH preview, confirm) can never show a
 * stale shortfall/total just because one of them forgot to recompute it.
 *
 * "Jangan gunakan Harga Buyback untuk redemption. Kekurangan gram
 * menggunakan Harga Jual 916 semasa [yang dikunci]." — sellPriceSnapshot
 * here is always the LOCKED Harga Jual snapshot, never a live re-fetch.
 */
export function computeRedemptionAmounts(row: RedemptionAmountFields): {
  shortfallGram: Decimal;
  shortfallValueRm: Decimal;
  totalPaymentRm: Decimal;
} {
  const shortfallGram = toDecimal(row.itemWeightGram).minus(row.gramUsed);
  const shortfallValueRm = shortfallGram.times(row.sellPriceSnapshot);
  const totalPaymentRm = shortfallValueRm.plus(row.upahRm).plus(row.otherChargesRm).plus(row.postageRm);
  return { shortfallGram, shortfallValueRm, totalPaymentRm };
}
