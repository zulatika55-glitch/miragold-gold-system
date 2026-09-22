import crypto from "crypto";

/** Human-facing reference IDs. Not the DB primary key — used in receipts,
 * customer support, Sankyu POS remarks, and audit trails per spec. */

function randomSegment(len: number): string {
  return crypto.randomBytes(len).toString("hex").toUpperCase().slice(0, len);
}

function datePart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function newOrderRef(): string {
  return `ORD-${datePart()}-${randomSegment(6)}`;
}

export function newPaymentRef(): string {
  return `PAY-${datePart()}-${randomSegment(6)}`;
}

export function newLedgerRef(): string {
  return `LG-${datePart()}-${randomSegment(6)}`;
}

export function newCustomerId(): string {
  return `MG-${randomSegment(8)}`;
}

export function newBuybackRef(): string {
  return `JB-${datePart()}-${randomSegment(6)}`;
}
