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

type WalletData = { balanceGram: string; gramOnHold: string; totalGram: string; note: string; history: LedgerEntry[] };

type PriceInfo = { sellPrice916: string; buybackPrice916: string; rm100Equivalent: string; effectiveAt: string };

type BuybackRow = {
  requestRef: string;
  createdAt: string;
  gram: string;
  buybackPriceSnapshot: string;
  payoutAmountRm: string;
  status: string;
  payoutDate: string | null;
  payoutReference: string | null;
  rejectReason: string | null;
};

// Fasa 2A statuses shown to the customer — kept simple per spec section 13
// ("Jangan create terlalu banyak status yang mengelirukan staff") even
// though internally there are a couple more (PENDING_CONFIRMATION, EXPIRED).
const BUYBACK_STATUS_LABEL: Record<string, string> = {
  PENDING_CONFIRMATION: "Menunggu OTP",
  ON_HOLD: "Diterima, Menunggu Semakan",
  PROCESSING: "Sedang Diproses",
  PAID: "Pembayaran Direkod",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Tamat Tempoh (OTP)",
};

const BUYBACK_STATUS_STYLE: Record<string, string> = {
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-800",
  ON_HOLD: "bg-sky-100 text-sky-800",
  PROCESSING: "bg-sky-100 text-sky-800",
  PAID: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
  EXPIRED: "bg-zinc-100 text-zinc-500",
};

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
  paymentUrl: string | null;
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

// Customer-facing statuses only — no internal system codes (sir zul, 17/9).
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu Bayaran",
  CONFIRMED: "Menunggu Bayaran",
  COMPLETED: "Berjaya",
  FAILED: "Gagal",
  EXPIRED: "Tamat Tempoh",
  CANCELLED: "Gagal",
  REVERSED: "Gagal",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-700",
  EXPIRED: "bg-zinc-100 text-zinc-500",
  CANCELLED: "bg-red-100 text-red-700",
  REVERSED: "bg-red-100 text-red-700",
};

const LEDGER_TYPE_LABEL: Record<string, string> = {
  LOCK_BUY: "Pembelian Emas",
  REDEMPTION: "Tebus Emas",
  BUYBACK: "Jual Balik Emas",
  CONVERSION: "Tukar Ketulenan",
  TRADE_IN: "Tukar Barang Lama",
  ADJUSTMENT: "Pelarasan",
  REVERSAL: "Pembalikan",
};

// Balance privacy toggle — lets a customer hide their gram figure when
// their screen is visible to others, e.g. at the shop counter (sir zul, 19/9).
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

function formatReceiptDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${dd}/${mm}/${yyyy} ${h}:${min} ${ampm}`;
}

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

function downloadReceipt(order: OrderRow) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=680");
  if (!w) return;
  const html = `<!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8" />
<title>Resit ${order.orderRef}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; padding: 32px; color: #27272a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .brand { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #92400e; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
  td { padding: 8px 0; border-bottom: 1px solid #f4f4f5; }
  td:first-child { color: #71717a; }
  td:last-child { text-align: right; font-weight: 600; }
  .amount { font-size: 26px; font-weight: 700; color: #065f46; margin: 8px 0 0; }
</style>
</head>
<body>
  <div class="brand">Miragold Gold Wallet</div>
  <h1>Pembelian Emas Berjaya</h1>
  <p class="amount">RM${Number(order.amountRm).toFixed(2)}</p>
  <table>
    <tr><td>Jumlah Bayaran</td><td>RM${Number(order.amountRm).toFixed(2)}</td></tr>
    <tr><td>Harga Emas Dikunci</td><td>RM${order.priceSnapshot}/g</td></tr>
    <tr><td>Emas Diterima</td><td>${order.gram}g</td></tr>
    <tr><td>Tarikh &amp; Masa</td><td>${formatReceiptDateTime(order.createdAt)}</td></tr>
    <tr><td>No. Transaksi</td><td>${order.orderRef}</td></tr>
  </table>
</body>
</html>`;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function ReceiptModal({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-emerald-900/10 bg-white p-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-4 top-4 text-zinc-400 transition hover:text-zinc-600"
        >
          ✕
        </button>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
        <h2 className="mt-4 text-xl font-semibold text-zinc-900">Pembelian Emas Berjaya</h2>
        <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">RM{Number(order.amountRm).toFixed(2)}</p>

        <div className="mx-auto mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-100 bg-zinc-50 text-left text-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-500">Jumlah Bayaran</span>
            <span className="font-semibold tabular-nums text-zinc-800">RM{Number(order.amountRm).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-500">Harga Emas Dikunci</span>
            <span className="font-semibold tabular-nums text-zinc-800">RM{order.priceSnapshot}/g</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-500">Emas Diterima</span>
            <span className="font-semibold tabular-nums text-amber-900">{order.gram}g</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-500">Tarikh &amp; Masa</span>
            <span className="font-semibold text-zinc-800">{formatReceiptDateTime(order.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-500">No. Transaksi</span>
            <span className="font-mono text-xs text-zinc-600">{order.orderRef}</span>
          </div>
        </div>

        <button
          onClick={() => downloadReceipt(order)}
          className="mt-6 w-full rounded-full border border-amber-900/20 px-4 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-50"
        >
          Muat Turun Resit
        </button>
      </div>
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
  const [buybacks, setBuybacks] = useState<BuybackRow[] | null>(null);
  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [activeOrder, setActiveOrder] = useState<SingleOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<OrderRow | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Balance is visible by default on both server and client so the first
  // paint always matches (no `localStorage` on the server). Once mounted,
  // restore the customer's per-browser privacy preference, if they set one.
  const [hideBalance, setHideBalance] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("miragold_hide_balance") === "1";
      // Syncing from localStorage, which cannot be read during server rendering.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setHideBalance(true);
    } catch {
      // Private browsing / storage blocked — keep the visible default.
    }
  }, []);

  function toggleHideBalance() {
    setHideBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("miragold_hide_balance", next ? "1" : "0");
      } catch {
        // Best-effort only — nothing to do if storage isn't available.
      }
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [walletRes, ordersRes, buybackRes, priceRes] = await Promise.all([
        fetch("/api/wallet"),
        fetch("/api/orders"),
        fetch("/api/wallet/buyback"),
        fetch("/api/price"),
      ]);
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
      if (buybackRes.ok) setBuybacks((await buybackRes.json()).requests);
      if (priceRes.ok) setPrice(await priceRes.json());

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

  // Keep "Teruskan Pembayaran" reactive: once a pending order's price-lock
  // expires, the button should disappear without needing a page refresh.
  useEffect(() => {
    if (!orders?.some((o) => o.status === "PENDING")) return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [orders]);

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
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">Baki Emas Anda</p>
              <button
                onClick={toggleHideBalance}
                aria-label={hideBalance ? "Tunjuk baki" : "Sorok baki"}
                className="text-zinc-400 transition hover:text-amber-900"
              >
                {hideBalance ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <p className="text-3xl font-bold text-amber-900">{hideBalance ? "•••• g" : `${wallet.balanceGram} g`}</p>
            <p className="mt-1 text-xs text-zinc-400">{wallet.note}</p>
            {Number(wallet.gramOnHold) > 0 && !hideBalance && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                🔒 {wallet.gramOnHold} g dalam proses Jual Balik
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/checkout" className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white">
              Beli Emas 916
            </Link>
            <button disabled className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
              Tebus Emas (coming soon)
            </button>
            <Link
              href="/wallet/jual-emas"
              className="rounded-full border border-amber-900/30 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
            >
              Jual Emas
            </Link>
          </div>

          {price && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-900/10 bg-amber-50/50 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-amber-800">Harga Emas 916 Hari Ini</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Dikemaskini:{" "}
                  {new Date(price.effectiveAt).toLocaleString("ms-MY", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold tabular-nums text-zinc-700">Jual: RM{price.sellPrice916}/g</p>
                <p className="font-semibold tabular-nums text-zinc-700">Beli Balik: RM{price.buybackPrice916}/g</p>
              </div>
            </div>
          )}

          <h2 className="mt-8 text-lg font-medium text-zinc-900">Sejarah Transaksi</h2>
          <p className="text-xs text-zinc-400">Setiap percubaan pembelian — termasuk yang gagal/tamat tempoh.</p>

          {orders && orders.length === 0 ? (
            <div className="mt-2 flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/10 text-2xl">🛍️</span>
              <p className="mt-3 text-sm font-medium text-zinc-700">Belum ada pembelian emas.</p>
              <p className="mt-1 max-w-xs text-sm text-zinc-400">
                Mulakan pembelian Emas 916 pertama anda melalui Miragold Gold Wallet.
              </p>
              <Link
                href="/checkout"
                className="mt-4 rounded-full bg-amber-900 px-5 py-2 text-sm font-medium text-white hover:bg-amber-800"
              >
                Beli Emas 916
              </Link>
            </div>
          ) : (
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
                    <th className="px-3 py-2">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {orders?.map((o) => {
                    const lockStillValid = new Date(o.lockExpiresAt).getTime() > nowTick;
                    return (
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
                        <td className="px-3 py-2">
                          {o.status === "PENDING" && o.paymentUrl && lockStillValid && (
                            <a
                              href={o.paymentUrl}
                              className="inline-block whitespace-nowrap rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800"
                            >
                              Teruskan Pembayaran
                            </a>
                          )}
                          {o.status === "COMPLETED" && (
                            <button
                              onClick={() => setReceiptOrder(o)}
                              className="whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-amber-900/30 hover:text-amber-900"
                            >
                              Lihat Resit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mt-8 text-lg font-medium text-zinc-900">Sejarah Jual Balik Emas</h2>
          <p className="text-xs text-zinc-400">
            Harga yang digunakan ketika transaksi — bukan harga beli balik semasa (spec section 14).
          </p>
          {buybacks && buybacks.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-400">
              Belum ada permohonan Jual Emas.
            </div>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Tarikh</th>
                    <th className="px-3 py-2">Gram</th>
                    <th className="px-3 py-2">Harga Beli Balik</th>
                    <th className="px-3 py-2">Jumlah</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Rujukan</th>
                  </tr>
                </thead>
                <tbody>
                  {buybacks?.map((b) => (
                    <tr key={b.requestRef} className="border-t border-zinc-100">
                      <td className="px-3 py-2 text-zinc-500">{new Date(b.createdAt).toLocaleString("ms-MY")}</td>
                      <td className="px-3 py-2 font-medium tabular-nums text-amber-900">{b.gram} g</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-500">RM{b.buybackPriceSnapshot}/g</td>
                      <td className="px-3 py-2 font-medium tabular-nums">RM{b.payoutAmountRm}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${BUYBACK_STATUS_STYLE[b.status] ?? "bg-zinc-100 text-zinc-500"}`}
                        >
                          {BUYBACK_STATUS_LABEL[b.status] ?? b.status}
                        </span>
                        {b.status === "REJECTED" && b.rejectReason && (
                          <p className="mt-1 max-w-[180px] text-[11px] text-zinc-400">{b.rejectReason}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-400">{b.requestRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
                    <td className="px-3 py-2">{LEDGER_TYPE_LABEL[h.type] ?? h.type}</td>
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

      {receiptOrder && <ReceiptModal order={receiptOrder} onClose={() => setReceiptOrder(null)} />}
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
