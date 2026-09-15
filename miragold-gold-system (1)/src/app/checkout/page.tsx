"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PriceInfo = { sellPrice916: string; minimumAmountRm: string };

const QUICK_AMOUNTS = [100, 200, 350, 500, 1000];

export default function CheckoutPage() {
  const router = useRouter();
  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [amount, setAmount] = useState<number>(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) router.replace("/login?next=/checkout");
      });
    fetch("/api/price")
      .then((r) => r.json())
      .then(setPrice);
  }, [router]);

  const gram = price ? (amount / Number(price.sellPrice916)).toFixed(4) : "-";

  async function lockAndPay() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountRm: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      window.location.href = data.paymentUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900">Lock / Beli Emas 916</h1>
      {price && <p className="mt-1 text-sm text-zinc-500">Harga semasa: RM{price.sellPrice916} / gram</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((a) => (
          <button
            key={a}
            onClick={() => setAmount(a)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              amount === a ? "border-amber-900 bg-amber-900 text-white" : "border-zinc-300 text-zinc-700"
            }`}
          >
            RM{a}
          </button>
        ))}
      </div>

      <label className="mt-4 text-sm font-medium text-zinc-700">
        Jumlah lain (RM)
        <input
          type="number"
          min={100}
          step={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
        />
      </label>

      <div className="mt-4 rounded-lg bg-white border border-amber-900/10 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Jumlah bayar</span>
          <span className="font-medium">RM{amount.toFixed(2)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-zinc-500">Gram diterima (anggaran)</span>
          <span className="font-medium">{gram} g</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={lockAndPay}
        disabled={busy || amount < 100 || !price}
        className="mt-6 rounded-full bg-amber-900 px-6 py-3 font-medium text-white disabled:opacity-50"
      >
        {busy ? "Memproses..." : "Lock Harga & Bayar (Billplz)"}
      </button>

      <p className="mt-4 text-xs text-zinc-400">
        Harga akan dikunci sebentar (lock window) sehingga anda selesai bayar. Gram hanya dikreditkan selepas
        pembayaran disahkan oleh Billplz.
      </p>
    </main>
  );
}
