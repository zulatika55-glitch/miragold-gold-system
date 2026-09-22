/**
 * Fasa 2A — Module 06 (Jual Balik Emas / Buyback) shared config.
 *
 * Kept in one place so the OTP window and the payout wording shown to
 * customers can be tuned via env without hunting through every route/page
 * (mirrors how PRICE_LOCK_MINUTES works for Module 03).
 */

// How long a customer has to enter the OTP after confirming the sell
// preview before the request lazily expires and the gold hold releases
// (spec section 6 — "transaksi sensitif" needs OTP/PIN verification).
export const BUYBACK_OTP_EXPIRY_MINUTES = Number(process.env.BUYBACK_OTP_EXPIRY_MINUTES ?? "5");

// Payout turnaround wording shown to the customer when they tap "Jual
// Emas" (sir zul, 22/9): "Tetapkan 1-3 hari bekerja selepas permohonan
// diluluskan." Payout in Fasa 2A is a manual bank transfer done by Miragold
// staff (spec section 11), so this is a promise about process time, not
// something the system can guarantee automatically — keep it here as the
// single source of the wording instead of hard-coding the string in every
// page that shows it.
export const BUYBACK_PAYOUT_TIMEFRAME_LABEL = "1-3 hari bekerja selepas permohonan diluluskan";

// Minimum gram a customer may sell in one request. Kept small and
// configurable rather than hard-coded 0 — an admin may want a floor later
// without a code change (not in the Fasa 2A spec explicitly, but avoids
// dust-sized requests cluttering the admin queue).
export const BUYBACK_MIN_GRAM = Number(process.env.BUYBACK_MIN_GRAM ?? "0.01");
