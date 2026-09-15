import Decimal from "decimal.js";

/**
 * Decimal-safe arithmetic helpers for money (RM) and gold (gram).
 *
 * Spec section 24 (Developer Handover Rule): "Use decimal-safe arithmetic
 * for money and gram; never floating-point assumptions for financial
 * calculations." — never use plain JS numbers (`+`, `-`, `*`, `/`) on
 * money/gram values anywhere in the codebase; always go through here.
 *
 * Postgres NUMERIC columns come back from the driver as strings, which is
 * exactly what Decimal.js wants — no precision is lost in transit.
 */

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const GRAM_DISPLAY_DECIMALS = 4; // spec: UI shows 4 decimal places
export const GRAM_STORAGE_DECIMALS = 8; // DB keeps higher precision
export const RM_STORAGE_DECIMALS = 6;

export function toDecimal(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

/** Amount (RM) / price per gram (RM) = gram, per spec Module 03 formula. */
export function calcGramFromAmount(amountRm: string | number, pricePerGram: string | number): Decimal {
  const amount = toDecimal(amountRm);
  const price = toDecimal(pricePerGram);
  if (price.lte(0)) throw new Error("Price per gram must be greater than zero");
  return amount.dividedBy(price).toDecimalPlaces(GRAM_STORAGE_DECIMALS, Decimal.ROUND_DOWN);
}

/** RM100 -> gram equivalent shown on the public home page (Module 01). */
export function calcDisplayGramForAmount(amountRm: string | number, pricePerGram: string | number): string {
  return calcGramFromAmount(amountRm, pricePerGram).toDecimalPlaces(GRAM_DISPLAY_DECIMALS, Decimal.ROUND_DOWN).toFixed(GRAM_DISPLAY_DECIMALS);
}

export function formatGram(value: string | number | Decimal, decimals = GRAM_DISPLAY_DECIMALS): string {
  return toDecimal(value).toDecimalPlaces(decimals).toFixed(decimals);
}

export function formatRm(value: string | number | Decimal): string {
  return toDecimal(value).toDecimalPlaces(2).toFixed(2);
}

export function isPositive(value: string | number | Decimal): boolean {
  return toDecimal(value).gt(0);
}
