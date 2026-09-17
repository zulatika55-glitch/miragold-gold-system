"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type LedgerEntry = {
  ledgerRef: string;
  type: string;
  direction: "IN" | "OUT";
  gram: string;
  priceSnapshot: string | null;
  balanceAfter: string;
  refType: string;
  refId: string;
  timestamp: string;
};

type WalletData = { balanceGram: string; note: string; history: LedgerEntry[] };

type OrderRow = {
  orderRef: string;
  createdAt: string;
  amountRm: string;
  priceSnapshot: string;
  gram: string;
  status: string;
  lockExpiresAt: string;
  billplzBillId: string | null;
  paymentStatus: string;
};

type SingleOrder = {
  orderRef: string;
  createdAt: string;
  amountRm: string;
  priceSnapshot: string;
  gram: string;
  status: string;
  lockExpiresAt: string;
  billplzBillId: string | null;
  paymentStatus: string;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu Bayaran",
  CONFIRMED: "Disahkan",
  COMPLETED: "Berjaya",
  FAILED: "Gagal",
  EXPIRED: "Tamat Tempoh",
  CANCELLED: "Dibatalkan",
  REVERSED: "Dibalikkan",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-700",
  EXPIRED: "bg-zinc-100 text-zinc-500",
  CANCELLED: "bg-zinc-100 text-zinc-500",
  REVERSED: "bg-purple-100 text-purple-700",
};

function SuccessCard({ order }: { order: SingleOrder }) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-3xl border border-emerald-900/10 bg-white p-8 text-center shadow-[0_8px_40px_-12px_rgba(6,95,70,0.2)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
      <h2 className="mt-4 text-xl font-semibold text-zinc-900">Pembayaran Berjaya</h2>
      <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">RM{Number(order.amountRm).toFixed(2)}</p>

      <div className="mx-auto mt-6 max-w-sm divide-y divide-zinc-100 rounded-2xl border border-zinc-100 bg-zinc-50 text-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-zinc-500">Harga dikunci</span>
          <span className="font-semibold tabular-nums text-zinc-800">RM{order.priceSnapshot}/g</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-zinc-500">Gram diterima</span>
          <span className="font-semibold tabular-nums text-amber-900">{order.gram}g</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-zinc-500">Transaction ID</span>
          <span className="font-mono text-xs text-zinc-600">{order.orderRef}</span>
        </div>
      </div>

      <p className="mt-5 text-sm text-emerald-700">Telah dikreditkan ke Gold Wallet anda.</p>
    </div>
  );
}

function WalletContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderRef = searchParams.get("orderRef");
  const status = searchParams.get("status");

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [activeOrder, setActiveOrder] = useState<SingleOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [walletRes, ordersRes] = await Promise.all([fetch("/api/wallet"), fetch("/api/orders")]);
      if (cancelled) return;
      if (walletRes.status === 401 || ordersRes.status === 401) {
        router.replace("/login?next=/wallet");
        return;
      }
      if (!walletRes.ok || !ordersRes.ok) {
        setError("Gagal memuatkan wallet");
        return;
      }
      setWallet(await walletRes.json());
      const ordersData = await ordersRes.json();
      setOrders(ordersData.orders);

      if (orderRef) {
        const orderDetailRes = await fetch(`/api/orders/${orderRef}`);
        if (!cancelled && orderDetailRes.ok) {
          const detail = await orderDetailRes.json();
          setActiveOrder(detail.order);
        }
      }
    }

    void load();
    // If we just came back from Billplz, poll briefly for the webhook to land.
    if (orderRef && status !== "COMPLETED") {
      const interval = setInterval(() => void load(), 2500);
      const timeout = setTimeout(() => clearInterval(interval), 20000);
      return () => {
        cancelled = true;
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderRef]);

  const showSuccessCard = activeOrder && activeOrder.status === "COMPLETED";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900">Gold Wallet</h1>

      {orderRef && !showSuccessCard && (
        <p className="mt-2 text-sm text-zinc-500">
          Pesanan {orderRef}: status semasa{" "}
          <span className="font-medium">{activeOrder ? STATUS_LABEL[activeOrder.status] ?? activeOrder.status : status}</span>
          {activeOrder?.status !== "COMPLETED" && " (menunggu pengesahan pembayaran...)"}
        </p>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {showSuccessCard && activeOrder && <SuccessCard order={activeOrder} />}

      {wallet && (
        <>
          <div className="mt-4 rounded-2xl border border-amber-900/10 bg-white p-6">
            <p className="text-sm text-zinc-500">Baki Emas Anda</p>
            <p className="text-3xl font-bold text-amber-900">{wallet.balanceGram} g</p>
            <p className="mt-1 text-xs text-zinc-400">{wallet.note}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/checkout" className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white">
              Beli Emas 916
            </Link>
            <button disabled className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
              Tebus Emas (coming soon)
            </button>
            <button disabled className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
              Jual Emas (coming soon)
            </button>
          </div>

          <h2 className="mt-8 text-lg font-medium text-zinc-900">Sejarah Transaksi</h2>
          <p className="text-xs text-zinc-400">Setiap percubaan pembelian — termasuk yang gagal/tamat tempoh.</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Tarikh &amp; Masa</th>
                  <th className="px-3 py-2">RM Dibayar</th>
                  <th className="px-3 py-2">Harga Lock</th>
                  <th className="px-3 py-2">Gram Diterima</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Transaction ID</th>
                </tr>
              </thead>
              <tbody>
                {orders && orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                      Tiada transaksi lagi.
                    </td>
                  </tr>
                )}
                {orders?.map((o) => (
                  <tr key={o.orderRef} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-500">{new Date(o.createdAt).toLocaleString("ms-MY")}</td>
                    <td className="px-3 py-2 font-medium tabular-nums">RM{Number(o.amountRm).toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-500">RM{o.priceSnapshot}/g</td>
                    <td className="px-3 py-2 font-medium tabular-nums text-amber-900">
                      {o.status === "COMPLETED" ? `${o.gram} g` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status] ?? "bg-zinc-100 text-zinc-500"}`}
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-400">{o.orderRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 text-lg font-medium text-zinc-900">Rekod Pergerakan Emas</h2>
          <p className="text-xs text-zinc-400">Setiap gram masuk dan keluar direkod di sini secara terperinci.</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Tarikh</th>
                  <th className="px-3 py-2">Jenis</th>
                  <th className="px-3 py-2">Gram</th>
                  <th className="px-3 py-2">Baki</th>
                  <th className="px-3 py-2">Rujukan</th>
                </tr>
              </thead>
              <tbody>
                {wallet.history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                      Tiada pergerakan lagi.
                    </td>
                  </tr>
                )}
                {wallet.history.map((h) => (
                  <tr key={h.ledgerRef} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-500">{new Date(h.timestamp).toLocaleString("ms-MY")}</td>
                    <td className="px-3 py-2">{h.type}</td>
                    <td className={`px-3 py-2 font-medium ${h.direction === "IN" ? "text-green-700" : "text-red-700"}`}>
                      {h.direction === "IN" ? "+" : "-"}
                      {h.gram} g
                    </td>
                    <td className="px-3 py-2">{h.balanceAfter} g</td>
                    <td className="px-3 py-2 text-zinc-400">{h.refId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

export default function WalletPage() {
  return (
    <Suspense>
      <WalletContent />
    </Suspense>
  );
}
