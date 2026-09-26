"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

type Detail = {
  redemptionRef: string;
  createdAt: string;
  productName: string;
  sku: string;
  itemWeightGram: string;
  gramUsed: string;
  sellPriceSnapshot: string;
  upahRatePerGramSnapshot: string | null;
  upahRm: string;
  upahOverrideReason: string | null;
  otherChargesRm: string;
  postageRm: string;
  shortfallGram: string;
  shortfallValueRm: string;
  totalPaymentRm: string;
  deliveryMethod: string;
  deliveryDetails: { address?: string; phone?: string; note?: string } | null;
  deliveryTrackingReference: string | null;
  status: string;
  otpExpiresAt: string | null;
  confirmedAt: string | null;
  paymentExpiresAt: string | null;
  paymentConfirmedAt: string | null;
  notes: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  processedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  customerName: string;
  customerPhone: string;
  customerId: string;
};

type AuditRow = { action: string; actorType: string; reason: string | null; timestamp: string };

const STATUS_LABEL: Record<string, string> = {
  AWAITING_CUSTOMER_CONFIRMATION: "Menunggu Customer Sahkan",
  PENDING_CONFIRMATION: "Menunggu OTP",
  AWAITING_PAYMENT: "Menunggu Bayaran",
  PAYMENT_CONFIRMED: "Bayaran Disahkan",
  PROCESSING: "Diproses",
  READY_FOR_FULFILLMENT: "Sedia Diambil/Dihantar",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Tamat Tempoh",
};

export default function AdminRedemptionDetailPage() {
  const router = useRouter();
  const params = useParams<{ redemptionRef: string }>();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [trail, setTrail] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [trackingRef, setTrackingRef] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/redemption/${params.redemptionRef}`);
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        return;
      }
      if (!res.ok) throw new Error("Redemption tidak dijumpai");
      const data = await res.json();
      setDetail(data.redemption);
      setTrail(data.auditTrail);
      setTrackingRef((t) => t || data.redemption.deliveryTrackingReference || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [params.redemptionRef]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) {
          router.replace(`/login?next=/admin/redemption/${params.redemptionRef}`);
        } else if (!["ADMIN", "OWNER"].includes(d.user.role)) {
          router.replace("/wallet");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!me || !["ADMIN", "OWNER"].includes(me.role)) return;
    // Deliberately not calling load() here (its first statement sets state
    // synchronously) — inline an async fetch instead, matching the pattern
    // used by the other admin pages. load() itself is still used for
    // re-fetching after an action (callAction), outside of an effect.
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/redemption/${params.redemptionRef}`);
        if (cancelled) return;
        if (res.status === 403) {
          setError("Akses ditolak — akaun ini bukan admin.");
          return;
        }
        if (!res.ok) throw new Error("Redemption tidak dijumpai");
        const data = await res.json();
        if (cancelled) return;
        setDetail(data.redemption);
        setTrail(data.auditTrail);
        setTrackingRef((t) => t || data.redemption.deliveryTrackingReference || "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [me, params.redemptionRef]);

  async function callAction(action: "process" | "ready" | "complete" | "cancel", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/redemption/${params.redemptionRef}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Tindakan gagal");
      setShowCancel(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (me === undefined) return null;

  const CANCELLABLE = [
    "AWAITING_CUSTOMER_CONFIRMATION",
    "PENDING_CONFIRMATION",
    "AWAITING_PAYMENT",
    "PAYMENT_CONFIRMED",
    "PROCESSING",
    "READY_FOR_FULFILLMENT",
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
      <Link href="/admin/redemption" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Tebus Barang Kemas
      </Link>

      {loading && <p className="mt-6 text-zinc-400">Memuatkan...</p>}
      {error && <p className="mt-6 text-red-600">{error}</p>}

      {detail && (
        <>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">{detail.redemptionRef}</h1>
              <p className="text-sm text-zinc-500">
                {detail.customerName} · {detail.customerPhone} · {detail.customerId}
              </p>
            </div>
            <span className="rounded-full border border-amber-900/20 bg-amber-900/5 px-3 py-1 text-sm font-medium text-amber-900">
              {STATUS_LABEL[detail.status] ?? detail.status}
            </span>
          </div>

          <div className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            <Row label="Tarikh Quotation" value={new Date(detail.createdAt).toLocaleString("ms-MY")} />
            <Row label="Produk" value={`${detail.productName} (${detail.sku})`} />
            <Row label="Berat Barang (locked)" value={`${detail.itemWeightGram} g`} />
            <Row label="Gram Wallet Digunakan" value={`${detail.gramUsed} g`} />
            <Row label="Harga Jual 916 (locked)" value={`RM${detail.sellPriceSnapshot}/g`} />
            <Row label="Kekurangan Gram" value={`${detail.shortfallGram} g`} />
            <Row label="Nilai Kekurangan Emas" value={`RM${detail.shortfallValueRm}`} />
            <Row
              label="Upah"
              value={`RM${detail.upahRm}${detail.upahRatePerGramSnapshot ? ` (kadar RM${detail.upahRatePerGramSnapshot}/g)` : " (override)"}`}
            />
            {detail.upahOverrideReason && <Row label="Sebab Override Upah" value={detail.upahOverrideReason} />}
            <Row label="Caj Lain" value={`RM${detail.otherChargesRm}`} />
            <Row label="Postage" value={`RM${detail.postageRm}`} />
            <Row label="Jumlah Bayaran RM" value={`RM${detail.totalPaymentRm}`} bold />
            <Row label="Kaedah" value={detail.deliveryMethod === "DELIVERY" ? "Penghantaran" : "Ambil Sendiri"} />
            {detail.deliveryDetails?.address && <Row label="Alamat" value={detail.deliveryDetails.address} />}
            {detail.deliveryDetails?.phone && <Row label="No. Telefon Penerima" value={detail.deliveryDetails.phone} />}
            {detail.deliveryTrackingReference && <Row label="Rujukan Tracking" value={detail.deliveryTrackingReference} mono />}
            {detail.notes && <Row label="Nota Staff" value={detail.notes} />}
          </div>

          {detail.status === "CANCELLED" && detail.cancelReason && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span className="font-medium">Sebab dibatalkan:</span> {detail.cancelReason}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-2">
            {detail.status === "PAYMENT_CONFIRMED" && (
              <button
                onClick={() => callAction("process")}
                disabled={busy}
                className="rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                Mula Proses
              </button>
            )}

            {detail.status === "PROCESSING" && (
              <div className="w-full rounded-2xl border border-amber-900/10 bg-white p-5">
                <h2 className="text-sm font-medium text-zinc-900">Tandakan Sedia (Ready for Pickup/Delivery)</h2>
                {detail.deliveryMethod === "DELIVERY" && (
                  <label className="mt-3 block text-sm text-zinc-700">
                    Rujukan Tracking (opsyenal)
                    <input
                      value={trackingRef}
                      onChange={(e) => setTrackingRef(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                    />
                  </label>
                )}
                <button
                  onClick={() => callAction("ready", trackingRef ? { deliveryTrackingReference: trackingRef } : {})}
                  disabled={busy}
                  className="mt-3 rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Tandakan Sedia
                </button>
              </div>
            )}

            {detail.status === "READY_FOR_FULFILLMENT" && (
              <button
                onClick={() => callAction("complete")}
                disabled={busy}
                className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Tandakan Selesai (Complete)
              </button>
            )}

            {CANCELLABLE.includes(detail.status) && (
              <button
                onClick={() => setShowCancel(true)}
                className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Batalkan
              </button>
            )}
          </div>

          {showCancel && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <label className="text-sm font-medium text-red-800">
                Sebab batal (mandatori)
                <textarea
                  required
                  minLength={5}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2"
                  rows={2}
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => callAction("cancel", { reason: cancelReason })}
                  disabled={busy || cancelReason.trim().length < 5}
                  className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Sahkan Batal
                </button>
                <button
                  onClick={() => setShowCancel(false)}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          <h2 className="mt-8 text-sm font-medium uppercase tracking-widest text-zinc-400">Audit Trail</h2>
          <div className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white text-sm">
            {trail.length === 0 && <p className="px-4 py-3 text-zinc-400">Tiada rekod.</p>}
            {trail.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-zinc-700">{a.action}</span>
                <span className="text-xs text-zinc-400">{new Date(a.timestamp).toLocaleString("ms-MY")}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Row({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={`text-right text-sm ${bold ? "font-bold text-amber-900" : "font-medium text-zinc-900"} ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
