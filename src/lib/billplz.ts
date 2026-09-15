import crypto from "crypto";

/**
 * Minimal Billplz v3 client — just what Module 03 (Lock/Buy) needs:
 * create a bill, and verify the X-Signature on webhook/redirect callbacks
 * so a forged callback can never credit gram (spec 16.4 idempotency /
 * webhook integrity, and 24 "every external payment event must have a
 * unique provider reference").
 *
 * Docs: https://www.billplz.com/api
 */

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — configure Billplz in .env.local`);
  return v;
}

export type CreateBillParams = {
  amountSen: number; // Billplz amount is in sen (RM * 100)
  name: string;
  email?: string;
  mobile?: string;
  description: string;
  reference1Label?: string;
  reference1?: string; // we pass our internal order_ref here
  callbackUrl: string;
  redirectUrl: string;
};

export type BillplzBill = {
  id: string;
  url: string;
  state: string;
  paid: boolean;
};

export async function createBill(params: CreateBillParams): Promise<BillplzBill> {
  const apiKey = getEnv("BILLPLZ_API_KEY");
  const collectionId = getEnv("BILLPLZ_COLLECTION_ID");
  const baseUrl = process.env.BILLPLZ_BASE_URL ?? "https://www.billplz-sandbox.com/api/v3";

  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  const body = new URLSearchParams({
    collection_id: collectionId,
    email: params.email ?? "",
    mobile: params.mobile ?? "",
    name: params.name,
    amount: String(params.amountSen),
    description: params.description,
    callback_url: params.callbackUrl,
    redirect_url: params.redirectUrl,
    ...(params.reference1 ? { reference_1_label: params.reference1Label ?? "Order", reference_1: params.reference1 } : {}),
  });

  const res = await fetch(`${baseUrl}/bills`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Billplz create bill failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  return { id: json.id, url: json.url, state: json.state, paid: json.paid };
}

/**
 * Billplz signs callback/redirect payloads with X-Signature = HMAC-SHA256
 * of the sorted "key" params, keyed by your X_Signature Key (set in the
 * Billplz collection settings). We recompute it and compare — a mismatch
 * means the request did not really come from Billplz.
 */
export function verifyXSignature(payload: Record<string, string>): boolean {
  const signatureKey = process.env.BILLPLZ_X_SIGNATURE_KEY;
  if (!signatureKey) {
    // Not configured yet (e.g. local dev without sandbox keys) — caller
    // decides whether to allow through; production must set this.
    return process.env.NODE_ENV !== "production";
  }

  const { x_signature, ...rest } = payload;
  if (!x_signature) return false;

  const sourceString = Object.keys(rest)
    .sort()
    .map((key) => `${key}${rest[key]}`)
    .join("|");

  const expected = crypto.createHmac("sha256", signatureKey).update(sourceString).digest("hex");

  // constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(x_signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
