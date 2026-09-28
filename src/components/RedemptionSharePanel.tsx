"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Fasa 2B — "3 cara customer sambung" (sir zul, 28/9): after a staff-created
// redemption quotation, the customer still has to log into their own Gold
// Wallet and pass OTP themselves (staff can never do this for them — see
// the confirm/request-otp routes under /api/wallet/redemption, which only
// accept the logged-in customer's own session). This panel just gets the
// SAME secure link (/wallet/redemption/[ref]) into the customer's hands
// three different ways depending on how they walked in:
//   - WhatsApp: for a customer contacted over chat/TikTok Live.
//   - Copy Secure Link: to paste anywhere (SMS, another app).
//   - QR code: for a walk-in customer at the counter to scan with their OWN
//     phone, so the confirm+OTP still happens on their device, not staff's.
// Nothing here touches calculation, Gold Hold, or the Billplz/confirm flow.

export function buildRedemptionCustomerUrl(redemptionRef: string): string {
  if (typeof window === "undefined") return `/wallet/redemption/${redemptionRef}`;
  return `${window.location.origin}/wallet/redemption/${redemptionRef}`;
}

function buildWhatsAppUrl(phone: string, customerName: string, redemptionRef: string, url: string): string {
  // Phone is stored normalized (+60XXXXXXXXX — see src/lib/phone.ts); wa.me
  // wants digits only, no "+".
  const digits = phone.replace(/\D/g, "");
  const message = `Hai ${customerName}, ini link untuk sahkan tebusan barang kemas anda (${redemptionRef}):\n${url}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function RedemptionSharePanel({
  redemptionRef,
  customerName,
  customerPhone,
}: {
  redemptionRef: string;
  customerName: string;
  customerPhone: string;
}) {
  // Pure function of redemptionRef — derived directly during render rather
  // than stored in state (nothing async about it; only the QR image below
  // actually needs an effect).
  const url = buildRedemptionCustomerUrl(redemptionRef);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 220 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can refuse (permissions, non-secure context) — the
      // link is still visible in the read-only field below for manual copy.
    }
  }

  return (
    <div className="rounded-xl border border-amber-900/10 bg-amber-900/5 p-4">
      <p className="text-sm font-medium text-zinc-900">Hantar kepada Customer</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        Customer mesti sahkan sendiri (login Gold Wallet + OTP) — staff tidak boleh sahkan bagi pihak customer.
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div className="flex flex-wrap gap-2">
          <a
            href={buildWhatsAppUrl(customerPhone, customerName, redemptionRef, url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            WhatsApp Customer
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-amber-900/40"
          >
            {copied ? "Link disalin!" : "Copy Secure Link"}
          </button>
        </div>
        {qrDataUrl && (
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated client-side data: URL, not a static asset */}
            <img
              src={qrDataUrl}
              alt={`QR code untuk sahkan redemption ${redemptionRef}`}
              className="h-32 w-32 rounded-lg border border-zinc-200 bg-white p-1"
            />
            <span className="text-xs text-zinc-400">QR Customer Confirm</span>
          </div>
        )}
      </div>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-500"
      />
    </div>
  );
}
