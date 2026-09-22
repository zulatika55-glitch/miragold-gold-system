"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Row = {
  requestRef: string;
  createdAt: string;
  gram: string;
  buybackPriceSnapshot: string;
  payoutAmountRm: string;
  status: string;
  bankAccountNumberMasked: string;
  customerName: string;
  customerPhone: string;
  customerId: string;
};

type Summary = {
  onHold: string;
  pendingConfirmation: number;
  onHoldCount: number;
  processing: number;
  payoutPending: number;
  completed: number;
  rejected: number;
};

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

const STATUS_STYLE: Record<string, string> = {
  ON_HOLD: "border-sky-200 bg-sky-50 text-sky-800",
  PROCESSING: "border-sky-200 bg-sky-50 text-sky-800",
  PAID: "border-amber-200 bg-amber-50 text-amber-800",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REJECTED: "border-red-200 bg-red-50 text-red-800",
  CANCELLED: "border-red-200 bg-red-50 text-red-800",
  EXPIRED: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const FILTER_STATUSES = ["ON_HOLD", "PROCESSING", "PAID", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"];

export default function AdminBuybackPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/buyback${params.toString() ? `?${params}` : ""}`);
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        return;
      }
      if (!res.ok) throw new Error("Gagal memuatkan senarai permohonan");
      const data = await res.json();
      setRows(data.requests);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) {
          router.replace("/login?next=/admin/buyback");
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
    // used by the other admin pages.
    let cancelled = false;
    async function run() {
      const res = await fetch("/api/admin/buyback");
      if (cancelled) return;
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Gagal memuatkan senarai permohonan");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setRows(data.requests);
      setSummary(data.summary);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [me]);

  if (me === undefined) return null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Panel Admin
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/10 text-lg">💵</span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Jual Balik Emas (Buyback)</h1>
          <p className="text-sm text-zinc-500">Semak dan proses setiap permohonan Jual Emas customer.</p>
        </div>
      </div>

      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Gold On Hold" value={`${summary.onHold} g`} accent />
          <SummaryCard label="Menunggu Semakan" value={summary.onHoldCount} warn={summary.onHoldCount > 0} />
          <SummaryCard label="Sedang Diproses" value={summary.processing} />
          <SummaryCard label="Payout Pending" value={summary.payoutPending} warn={summary.payoutPending > 0} />
          <SummaryCard label="Selesai" value={summary.completed} />
          <SummaryCard label="Ditolak/Dibatalkan" value={summary.rejected} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q, statusFilter)}
          placeholder="Cari nama / phone / customer ID / rujukan..."
          className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            void load(q, e.target.value);
          }}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Semua status (kecuali Menunggu OTP)</option>
          {FILTER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>
        <button
          onClick={() => load(q, statusFilter)}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-amber-900/40"
        >
          Cari
        </button>
      </div>

      {error && <p className="mt-4 text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-zinc-400">Memuatkan...</p>}

      {!loading && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2">Tarikh</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Gram</th>
                <th className="px-3 py-2">Harga Lock</th>
                <th className="px-3 py-2">Payout</th>
                <th className="px-3 py-2">Akaun Bank</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Rujukan</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-zinc-400">
                    Tiada permohonan dijumpai.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.requestRef}
                  onClick={() => router.push(`/admin/buyback/${r.requestRef}`)}
                  className="cursor-pointer border-t border-zinc-100 odd:bg-white even:bg-zinc-50/50 hover:bg-amber-50/40"
                >
                  <td className="px-3 py-2 text-zinc-500">{new Date(r.createdAt).toLocaleString("ms-MY")}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">{r.customerName}</div>
                    <div className="text-xs text-zinc-400">
                      {r.customerPhone} · {r.customerId}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium tabular-nums text-amber-900">{r.gram} g</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">RM{r.buybackPriceSnapshot}/g</td>
                  <td className="px-3 py-2 font-medium tabular-nums">RM{r.payoutAmountRm}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{r.bankAccountNumberMasked}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status] ?? "border-zinc-200 bg-zinc-50 text-zinc-500"}`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{r.requestRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ label, value, warn, accent }: { label: string; value: string | number; warn?: boolean; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${warn ? "border-red-200 bg-red-50" : accent ? "border-amber-900/20 bg-amber-900/5" : "border-amber-900/10 bg-white"}`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${warn ? "text-red-700" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
}
