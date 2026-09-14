import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * User-facing redirect after paying on Billplz's hosted page. This is
 * DISPLAY ONLY — actual wallet crediting happens in the server-to-server
 * webhook (spec: "Screenshot customer bukan bukti settlement"). By the
 * time the user lands here the webhook has often already run, but we
 * don't rely on that; we just show current order status and tell the
 * user to check their wallet.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderRef = searchParams.get("order");
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  if (!orderRef) {
    return NextResponse.redirect(`${appBaseUrl}/wallet`);
  }

  const [order] = await db.select().from(orders).where(eq(orders.orderRef, orderRef)).limit(1);
  const status = order?.status ?? "UNKNOWN";

  return NextResponse.redirect(`${appBaseUrl}/wallet?orderRef=${orderRef}&status=${status}`);
}
