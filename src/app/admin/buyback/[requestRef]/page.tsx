"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

type Detail = {
  requestRef: string;
  createdAt: string;
  gram: string;
  buybackPriceSnapshot: string;
  payoutAmountRm: string;
  status: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolderName: string;
  rejectReason: string | null;
  payoutDate: string | null;
  payoutReference: string | null;
  payoutAmountPaid: string | null;
  payoutNote: string | null;
  completedAt: string | null;
  customerName: string;
  customerPhone: string;
  customerId: string;
};

type AuditRow = { action: string; actorType: string; reason: string | null; timestamp: string };

const STATUS_LABEL: Record<string, string> = {
  PENDING_CONFIRMATION: "Menunggu OTP",
  ON_HOLD: "Menunggu Semakan",
  PROCESSING: "Diproses",
  PAID: "Payout Direkod",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Tamat OTP",
};

export default function AdminBuybackDetailPage() {
  const router = useRouter();
  const params = useParams<{ requestRef: string }>();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [trail, setTrail] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ payoutReference: "", payoutAmountPaid: "", payoutNote: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/buyback/${params.requestRef}`);
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        return;
      }
      if (!res.ok) throw new Error("Permohonan tidak dijumpai");
      const data = await res.json();
      setDetail(data.request);
      setTrail(data.auditTrail);
      setPayoutForm((f) => ({ ...f, payoutAmountPaid: f.payoutAmountPaid || data.request.payoutAmountRm }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [params.requestRef]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) {
          router.replace(`/login?next=/admin/buyback/${params.requestRef}`);
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
        const res = await fetch(`/api/admin/buyback/${params.requestRef}`);
        if (cancelled) return;
        if (res.status === 403) {
          setError("Akses ditolak — akaun ini bukan admin.");
          return;
        }
        if (!res.ok) throw new Error("Permohonan tidak dijumpai");
        const data = await res.json();
        if (cancelled) return;
        setDetail(data.request);
        setTrail(data.auditTrail);
        setPayoutForm((f) => ({ ...f, payoutAmountPaid: f.payoutAmountPaid || data.request.payoutAmountRm }));
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
  }, [me, params.requestRef]);

  async function callAction(action: "approve" | "reject" | "mark-paid" | "complete", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/buyback/${params.requestRef}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Tindakan gagal");
      setShowReject(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (me === undefined) return null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
      <Link href="/admin/buyback" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Jual Balik Emas
      </Link>

      {loading && <p className="mt-6 text-zinc-400">Memuatkan...</p>}
      {error && <p className="mt-6 text-red-600">{error}</p>}

      {detail && (
        <>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">{detail.requestRef}</h1>
              <p className="text-sm text-zinc-500">
                {detail.customerName} · {detail.customerPhone} · {detail.customerId}
              </p>
            </div>
            <span className="rounded-full border border-amber-900/20 bg-amber-900/5 px-3 py-1 text-sm font-medium text-amber-900">
              {STATUS_LABEL[detail.status] ?? detail.status}
            </span>
          </div>

          <div className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            <Row label="Tarikh Permohonan" value={new Date(detail.createdAt).toLocaleString("ms-MY")} />
            <Row label="Gram Dijual (locked)" value={`${detail.gram} g`} />
            <Row label="Harga Beli Balik (locked)" value={`RM${detail.buybackPriceSnapshot}/g`} />
            <Row label="Jumlah Payout" value={`RM${detail.payoutAmountRm}`} bold />
            <Row label="Bank" value={detail.bankName} />
            <Row label="No. Akaun" value={detail.bankAccountNumber} mono />
            <Row label="Nama Pemegang Akaun" value={detail.bankAccountHolderName} />
          </div>

          {detail.status === "REJECTED" && detail.rejectReason && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span className="font-medium">Sebab ditolak:</span> {detail.rejectReason}
            </div>
          )}

          {(detail.status === "PAID" || detail.status === "COMPLETED") && detail.payoutReference && (
            <div className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white text-sm">
              <Row label="Tarikh Payout" value={detail.payoutDate ? new Date(detail.payoutDate).toLocaleString("ms-MY") : "—"} />
              <Row label="Rujukan Payout" value={detail.payoutReference} mono />
              <Row label="Jumlah Dibayar" value={`RM${detail.payoutAmountPaid ?? "—"}`} />
              {detail.payoutNote && <Row label="Nota" value={detail.payoutNote} />}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-2">
            {detail.status === "ON_HOLD" && (
              <>
                <button
                  onClick={() => callAction("approve")}
                  disabled={busy}
                  className="rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                >
                  Terima & Proses
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Tolak
                </button>
              </>
            )}

            {detail.status === "PROCESSING" && (
              <button
                onClick={() => setShowReject(true)}
                className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Tolak / Batal
              </button>
            )}

            {detail.status === "PAID" && (
              <button
                onClick={() => callAction("complete")}
                disabled={busy}
                className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Tandakan Selesai (Complete)
              </button>
            )}
          </div>

          {showReject && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <label className="text-sm font-medium text-red-800">
                Sebab tolak/batal (mandatori)
                <textarea
                  required
                  minLength={5}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2"
                  rows={2}
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => callAction("reject", { reason: rejectReason })}
                  disabled={busy || rejectReason.trim().length < 5}
                  className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Sahkan Tolak
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {detail.status === "PROCESSING" && (
            <div className="mt-4 rounded-2xl border border-amber-900/10 bg-white p-5">
              <h2 className="text-sm font-medium text-zinc-900">Rekod Payout (pindahan bank manual)</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-zinc-700">
                  Rujukan Payout
                  <input
                    value={payoutForm.payoutReference}
                    onChange={(e) => setPayoutForm((f) => ({ ...f, payoutReference: e.target.value }))}
                    placeholder="Cth: Rujukan transfer bank"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-zinc-700">
                  Jumlah Dibayar (RM)
                  <input
                    type="number"
                    step="0.01"
                    value={payoutForm.payoutAmountPaid}
                    onChange={(e) => setPayoutForm((f) => ({ ...f, payoutAmountPaid: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-zinc-700 sm:col-span-2">
                  Nota (opsyenal)
                  <textarea
                    value={payoutForm.payoutNote}
                    onChange={(e) => setPayoutForm((f) => ({ ...f, payoutNote: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                    rows={2}
                  />
                </label>
              </div>
              <button
                onClick={() =>
                  callAction("mark-paid", {
                    payoutReference: payoutForm.payoutReference,
                    payoutAmountPaid: Number(payoutForm.payoutAmountPaid),
                    payoutNote: payoutForm.payoutNote || undefined,
                  })
                }
                disabled={busy || !payoutForm.payoutReference || !payoutForm.payoutAmountPaid}
                className="mt-3 rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Rekod Payout & Tanda Sudah Bayar
              </button>
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
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-amber-900" : "font-medium text-zinc-900"} ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
