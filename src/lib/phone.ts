/**
 * Malaysian phone number normalization.
 *
 * Customers should never have to think about "+60" when signing up — they
 * type the number the way they always do (e.g. 0123456789) and the system
 * standardizes it internally to +60123456789. This keeps one canonical
 * format in the database (and for Billplz), while still finding existing
 * accounts that were created before this normalization existed and may be
 * stored in either form.
 */

/** Strips everything except digits and a leading +. */
function cleanDigits(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Normalizes a Malaysian phone number to the canonical +60XXXXXXXXX form.
 * Non-Malaysian numbers (already has a different country code) are left
 * as-is beyond digit cleanup.
 */
export function normalizeMyPhone(input: string): string {
  const cleaned = cleanDigits(input);

  if (cleaned.startsWith("+60")) return cleaned;
  if (cleaned.startsWith("60")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+60${cleaned.slice(1)}`;
  // Already has some other country code, or is otherwise unrecognized —
  // don't guess further than basic cleanup.
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

/** The "0-prefixed" local form, e.g. +60123456789 -> 0123456789. */
export function toLocalMyPhone(normalized: string): string {
  return normalized.startsWith("+60") ? `0${normalized.slice(3)}` : normalized;
}

/**
 * All the representations a phone number might already be stored under in
 * the database, so lookups keep working for accounts created before this
 * normalization existed (mixed +60 / 0-prefixed / raw-as-typed formats).
 * New accounts are always inserted using normalizeMyPhone() as canonical.
 */
export function phoneLookupCandidates(input: string): string[] {
  const normalized = normalizeMyPhone(input);
  const local = toLocalMyPhone(normalized);
  return Array.from(new Set([normalized, local, input.trim()]));
}
