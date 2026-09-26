import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, redemptions } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * User-facing redirect after paying on Billplz's hosted page. This is
 * DISPLAY ONLY — actual wallet crediting / status advancement happens in the
 * server-to-server webhook (spec: "Screenshot customer bukan bukti
 * settlement"). By the time the user lands here the webhook has often
 * already run, but we don't rely on that; we just show current status and
 * tell the user to check their wallet.
 *
 * Handles two transaction kinds off two separate query params: `order` for
 * Module 03 Lock/Buy orders (unchanged), `redemption` for Fasa 2B
 * redemption shortfall payments (sends the customer back to their own
 * redemption detail page rather than the generic wallet page).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderRef = searchParams.get("order");
  const redemptionRef = searchParams.get("redemption");
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  if (redemptionRef) {
    const [redemption] = await db
      .select()
      .from(redemptions)
      .where(eq(redemptions.redemptionRef, redemptionRef))
      .limit(1);
    const status = redemption?.status ?? "UNKNOWN";

    return NextResponse.redirect(`${appBaseUrl}/wallet/redemption/${redemptionRef}?status=${status}`);
  }

  if (!orderRef) {
    return NextResponse.redirect(`${appBaseUrl}/wallet`);
  }

  const [order] = await db.select().from(orders).where(eq(orders.orderRef, orderRef)).limit(1);
  const status = order?.status ?? "UNKNOWN";

  return NextResponse.redirect(`${appBaseUrl}/wallet?orderRef=${orderRef}&status=${status}`);
}
