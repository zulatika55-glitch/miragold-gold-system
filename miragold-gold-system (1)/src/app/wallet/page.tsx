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

function WalletContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderRef = searchParams.get("orderRef");
  const status = searchParams.get("status");

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/wallet");
      if (cancelled) return;
      if (res.status === 401) {
        router.replace("/login?next=/wallet");
        return;
      }
      if (!res.ok) {
        setError("Gagal memuatkan wallet");
        return;
      }
      setWallet(await res.json());
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900">Gold Wallet</h1>

      {orderRef && (
        <p className="mt-2 text-sm text-zinc-500">
          Pesanan {orderRef}: status semasa <span className="font-medium">{status}</span>
          {status !== "COMPLETED" && " (menunggu pengesahan pembayaran...)"}
        </p>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {wallet && (
        <>
          <div className="mt-4 rounded-2xl border border-amber-900/10 bg-white p-6">
            <p className="text-sm text-zinc-500">Total Gram Emas 916</p>
            <p className="text-3xl font-bold text-amber-900">{wallet.balanceGram} g</p>
            <p className="mt-1 text-xs text-zinc-400">{wallet.note}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/checkout" className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white">
              Simpan Lagi
            </Link>
            <button disabled className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
              Tebus 916 (coming soon)
            </button>
            <button disabled className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
              Jual Balik (coming soon)
            </button>
          </div>

          <h2 className="mt-8 text-lg font-medium text-zinc-900">Sejarah Transaksi</h2>
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
                      Tiada transaksi lagi.
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
