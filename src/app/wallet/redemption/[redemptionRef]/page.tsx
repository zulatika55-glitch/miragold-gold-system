"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

type Detail = {
  redemptionRef: string;
  createdAt: string;
  productName: string;
  sku: string;
  itemWeightGram: string;
  gramUsed: string;
  sellPriceSnapshot: string;
  upahRm: string;
  otherChargesRm: string;
  postageRm: string;
  shortfallGram: string;
  shortfallValueRm: string;
  totalPaymentRm: string;
  deliveryMethod: string;
  status: string;
  otpExpiresAt: string | null;
  paymentExpiresAt: string | null;
  billplzUrl: string | null;
  cancelReason: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  AWAITING_CUSTOMER_CONFIRMATION: "Menunggu Pengesahan Anda",
  PENDING_CONFIRMATION: "Menunggu OTP",
  AWAITING_PAYMENT: "Menunggu Bayaran",
  PAYMENT_CONFIRMED: "Bayaran Disahkan",
  PROCESSING: "Sedang Disediakan",
  READY_FOR_FULFILLMENT: "Sedia Diambil/Dihantar",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Tamat Tempoh",
};

const CANCELLABLE = ["AWAITING_CUSTOMER_CONFIRMATION", "PENDING_CONFIRMATION", "AWAITING_PAYMENT"];

export default function CustomerRedemptionPage() {
  const router = useRouter();
  const params = useParams<{ redemptionRef: string }>();
  const searchParams = useSearchParams();

  const [me, setMe] = useState<{ id: string } | null | undefined>(undefined);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingGram, setEditingGram] = useState(false);
  const [gramInput, setGramInput] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/wallet/redemption/${params.redemptionRef}`);
      if (res.status === 401) {
        router.replace(`/login?next=/wallet/redemption/${params.redemptionRef}`);
        return;
      }
      if (!res.ok) throw new Error("Redemption tidak dijumpai");
      const data = await res.json();
      setDetail(data.redemption);
      setGramInput(data.redemption.gramUsed);
      if (data.redemption.billplzUrl) setPaymentUrl(data.redemption.billplzUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [params.redemptionRef, router]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) {
          router.replace(`/login?next=/wallet/redemption/${params.redemptionRef}`);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (me === undefined || me === null) return;
    // Deliberately not calling load() here (its first statement sets state
    // synchronously) — inline an async fetch instead, matching the pattern
    // used by the admin pages. load() itself is still used for re-fetching
    // after an action (saveGram/startConfirm/submitOtp/submitCancel).
    let cancelled = false;
    async function run() {
      setError(null);
      try {
        const res = await fetch(`/api/wallet/redemption/${params.redemptionRef}`);
        if (cancelled) return;
        if (res.status === 401) {
          router.replace(`/login?next=/wallet/redemption/${params.redemptionRef}`);
          return;
        }
        if (!res.ok) throw new Error("Redemption tidak dijumpai");
        const data = await res.json();
        if (cancelled) return;
        setDetail(data.redemption);
        setGramInput(data.redemption.gramUsed);
        if (data.redemption.billplzUrl) setPaymentUrl(data.redemption.billplzUrl);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function saveGram() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallet/redemption/${params.redemptionRef}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gramUsed: Number(gramInput) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal kemaskini gram");
      setDetail(data.redemption);
      setEditingGram(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallet/redemption/${params.redemptionRef}/request-otp`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal memulakan pengesahan");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallet/redemption/${params.redemptionRef}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kod OTP tidak sah");
      if (data.redemption?.paymentUrl) setPaymentUrl(data.redemption.paymentUrl);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallet/redemption/${params.redemptionRef}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal membatalkan");
      setShowCancel(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (me === undefined || loading) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-12">
        <p className="text-zinc-400">Memuatkan...</p>
      </main>
    );
  }

  const redirectStatus = searchParams.get("status");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-12">
      <Link href="/wallet" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Gold Wallet
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Tebus Barang Kemas</h1>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!detail && !error && <p className="mt-6 text-zinc-400">Redemption tidak dijumpai.</p>}

      {detail && (
        <div className="mt-6 rounded-2xl border border-amber-900/10 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-900">{detail.productName}</p>
              <p className="text-xs text-zinc-400">
                {detail.sku} · {detail.redemptionRef}
              </p>
            </div>
            <span className="rounded-full border border-amber-900/20 bg-amber-900/5 px-3 py-1 text-xs font-medium text-amber-900">
              {STATUS_LABEL[detail.status] ?? detail.status}
            </span>
          </div>

          {redirectStatus && detail.status === "AWAITING_PAYMENT" && (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              Jika anda baru sahaja membayar, sila tunggu seketika — status akan dikemaskini secara automatik.
            </div>
          )}

          <div className="mt-5 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
            <Row label="Berat Barang" value={`${detail.itemWeightGram} g`} />
            <Row
              label="Gram Wallet Digunakan"
              value={
                detail.status === "AWAITING_CUSTOMER_CONFIRMATION" && editingGram ? "" : `${detail.gramUsed} g`
              }
            />
            {detail.status === "AWAITING_CUSTOMER_CONFIRMATION" && editingGram && (
              <div className="flex items-center gap-2 px-4 py-3">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max={detail.itemWeightGram}
                  value={gramInput}
                  onChange={(e) => setGramInput(e.target.value)}
                  className="w-32 rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={saveGram}
                  disabled={busy}
                  className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Simpan
                </button>
                <button
                  onClick={() => {
                    setEditingGram(false);
                    setGramInput(detail.gramUsed);
                  }}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600"
                >
                  Batal
                </button>
              </div>
            )}
            <Row label="Kekurangan Gram" value={`${detail.shortfallGram} g`} />
            <Row label="Harga Jual 916 (locked)" value={`RM${detail.sellPriceSnapshot}/g`} />
            <Row label="Nilai Kekurangan Emas" value={`RM${detail.shortfallValueRm}`} />
            <Row label="Upah" value={`RM${detail.upahRm}`} />
            {Number(detail.otherChargesRm) > 0 && <Row label="Caj Lain" value={`RM${detail.otherChargesRm}`} />}
            {Number(detail.postageRm) > 0 && <Row label="Postage" value={`RM${detail.postageRm}`} />}
            <Row label="Jumlah Perlu Dibayar" value={`RM${detail.totalPaymentRm}`} bold />
            <Row label="Kaedah" value={detail.deliveryMethod === "DELIVERY" ? "Penghantaran" : "Ambil Sendiri"} />
          </div>

          {detail.status === "AWAITING_CUSTOMER_CONFIRMATION" && !editingGram && (
            <button
              onClick={() => setEditingGram(true)}
              className="mt-3 text-sm font-medium text-amber-900 hover:underline"
            >
              Ubah gram wallet digunakan
            </button>
          )}

          {detail.status === "AWAITING_CUSTOMER_CONFIRMATION" && (
            <button
              onClick={startConfirm}
              disabled={busy}
              className="mt-5 w-full rounded-full bg-amber-900 px-4 py-2.5 font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {busy ? "Memproses..." : "SAHKAN TEBUSAN"}
            </button>
          )}

          {detail.status === "PENDING_CONFIRMATION" && (
            <div className="mt-5">
              <label className="block text-sm font-medium text-zinc-700">
                Kod OTP
                <input
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 tracking-widest"
                />
              </label>
              <button
                onClick={submitOtp}
                disabled={busy || otpCode.length !== 6}
                className="mt-3 w-full rounded-full bg-amber-900 px-4 py-2.5 font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {busy ? "Mengesahkan..." : "Sahkan OTP"}
              </button>
            </div>
          )}

          {detail.status === "AWAITING_PAYMENT" && (
            <div className="mt-5 rounded-xl bg-amber-50/60 p-4 text-sm text-zinc-700">
              <p>
                Sila selesaikan bayaran RM{detail.totalPaymentRm} sebelum{" "}
                {detail.paymentExpiresAt ? new Date(detail.paymentExpiresAt).toLocaleString("ms-MY") : "tempoh tamat"}.
              </p>
              {paymentUrl && (
                <a
                  href={paymentUrl}
                  className="mt-3 inline-block rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-800"
                >
                  Bayar Sekarang
                </a>
              )}
            </div>
          )}

          {(detail.status === "PAYMENT_CONFIRMED" || detail.status === "PROCESSING") && (
            <div className="mt-5 rounded-xl bg-sky-50 p-4 text-sm text-sky-800">
              Barang anda sedang disediakan oleh Miragold. Kami akan hubungi anda apabila sedia.
            </div>
          )}

          {detail.status === "READY_FOR_FULFILLMENT" && (
            <div className="mt-5 rounded-xl bg-violet-50 p-4 text-sm text-violet-800">
              {detail.deliveryMethod === "DELIVERY"
                ? "Barang anda sedang/akan dihantar."
                : "Barang anda sudah sedia untuk diambil di kedai Miragold."}
            </div>
          )}

          {detail.status === "COMPLETED" && (
            <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              Tebusan ini telah selesai. Terima kasih kerana menggunakan Gold Wallet Miragold!
            </div>
          )}

          {(detail.status === "CANCELLED" || detail.status === "REJECTED" || detail.status === "EXPIRED") && (
            <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {STATUS_LABEL[detail.status]}
              {detail.cancelReason ? ` — ${detail.cancelReason}` : ""}
            </div>
          )}

          {CANCELLABLE.includes(detail.status) && !showCancel && (
            <button
              onClick={() => setShowCancel(true)}
              className="mt-4 text-sm font-medium text-red-700 hover:underline"
            >
              Batalkan Tebusan
            </button>
          )}

          {showCancel && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <label className="text-sm font-medium text-red-800">
                Sebab batal (opsyenal)
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2"
                  rows={2}
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={submitCancel}
                  disabled={busy}
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
        </div>
      )}
    </main>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  if (value === "") return null;
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={`text-sm tabular-nums ${bold ? "font-bold text-amber-900" : "font-medium text-zinc-900"}`}>{value}</span>
    </div>
  );
}
