import { NextResponse } from "next/server";
import { db } from "@/db";
import { buybackRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { formatGram, formatRm } from "@/lib/decimal";

// Single buyback request lookup, scoped to the logged-in customer — backs
// the confirm/OTP screen and the "Permohonan Berjaya" success screen (spec
// section 6) so both can show this exact request's locked figures.
export async function GET(req: Request, { params }: { params: Promise<{ requestRef: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { requestRef } = await params;
  const [row] = await db.select().from(buybackRequests).where(eq(buybackRequests.requestRef, requestRef)).limit(1);

  if (!row || row.customerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    request: {
      requestRef: row.requestRef,
      createdAt: row.createdAt,
      gram: formatGram(row.gram),
      buybackPriceSnapshot: formatRm(row.buybackPriceSnapshot),
      payoutAmountRm: formatRm(row.payoutAmountRm),
      status: row.status,
      otpExpiresAt: row.otpExpiresAt,
      payoutDate: row.payoutDate,
      payoutReference: row.payoutReference,
      rejectReason: row.rejectReason,
    },
  });
}
