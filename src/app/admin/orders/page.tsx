"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AdminOrderRow = {
  orderRef: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerId: string;
  amountRm: string;
  priceSnapshot: string;
  gram: string;
  orderStatus: string;
  billplzBillId: string | null;
  paymentStatus: string;
  walletCredited: boolean;
};

const ORDER_STATUS_STYLE: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  CONFIRMED: "border-sky-200 bg-sky-50 text-sky-800",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
  EXPIRED: "border-zinc-200 bg-zinc-100 text-zinc-600",
  CANCELLED: "border-zinc-200 bg-zinc-100 text-zinc-600",
  REVERSED: "border-violet-200 bg-violet-50 text-violet-800",
};

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
  REVERSED: "border-violet-200 bg-violet-50 text-violet-800",
};

export default function AdminOrdersPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders${search ? `?q=${encodeURIComponent(search)}` : ""}`);
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        setOrders([]);
        return;
      }
      if (!res.ok) throw new Error("Gagal memuatkan senarai transaksi");
      const data = await res.json();
      setOrders(data.orders);
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
          router.replace("/login?next=/admin/orders");
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
      const res = await fetch("/api/admin/orders");
      if (cancelled) return;
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        setOrders([]);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Gagal memuatkan senarai transaksi");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setOrders(data.orders);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [me]);

  if (me === undefined) return null;

  const completedCount = orders.filter((o) => o.orderStatus === "COMPLETED").length;
  const pendingCount = orders.filter((o) => o.orderStatus === "PENDING").length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Panel Admin
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/10 text-lg">🧾</span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Semua Transaksi</h1>
          <p className="text-sm text-zinc-500">
            Semak setiap transaksi customer: RM, harga lock, gram, rujukan Billplz, status bayaran &amp; kredit wallet.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">
          {completedCount} Berjaya
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
          {pendingCount} Menunggu
        </span>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-zinc-600">
          {orders.length} Jumlah (200 terkini)
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
          placeholder="Cari nama / phone / customer ID..."
          className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => load(q)}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:border-amber-900/40"
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
                <th className="px-3 py-2">RM</th>
                <th className="px-3 py-2">Harga Lock</th>
                <th className="px-3 py-2">Gram</th>
                <th className="px-3 py-2">Billplz Ref</th>
                <th className="px-3 py-2">Status Bayaran</th>
                <th className="px-3 py-2">Status Order</th>
                <th className="px-3 py-2">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-zinc-400">
                    Tiada transaksi dijumpai.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.orderRef} className="border-t border-zinc-100 odd:bg-white even:bg-zinc-50/50">
                  <td className="px-3 py-2 text-zinc-500">{new Date(o.createdAt).toLocaleString("ms-MY")}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">{o.customerName}</div>
                    <div className="text-xs text-zinc-400">
                      {o.customerPhone} · {o.customerId}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium tabular-nums">RM{Number(o.amountRm).toFixed(2)}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">RM{o.priceSnapshot}/g</td>
                  <td className="px-3 py-2 font-medium tabular-nums text-amber-900">{o.gram} g</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{o.billplzBillId ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        PAYMENT_STATUS_STYLE[o.paymentStatus] ?? "border-zinc-200 bg-zinc-50 text-zinc-500"
                      }`}
                    >
                      {o.paymentStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        ORDER_STATUS_STYLE[o.orderStatus] ?? "border-zinc-200 bg-zinc-50 text-zinc-500"
                      }`}
                    >
                      {o.orderStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {o.walletCredited ? (
                      <span className="text-emerald-600">✓ Dikreditkan</span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
