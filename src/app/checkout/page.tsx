"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PriceInfo = { sellPrice916: string; minimumAmountRm: string };

const QUICK_AMOUNTS = [
  { value: 100, icon: "🌱" },
  { value: 200, icon: "🪙" },
  { value: 350, icon: "✨" },
  { value: 500, icon: "💎" },
  { value: 1000, icon: "👑" },
];

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
    <main className="relative mx-auto flex w-full max-w-5xl flex-1 items-center overflow-hidden px-6 py-12">
      {/* ambient decoration */}
      <div className="glow-orb animate-float-slow -right-20 top-0 h-72 w-72 bg-amber-400/20" />
      <div className="glow-orb animate-float-slower -left-24 bottom-0 h-80 w-80 bg-amber-700/10" />
      <div className="grid-mesh absolute inset-x-0 top-0 h-72" />

      <div className="relative z-10 grid w-full gap-6 lg:grid-cols-5">
        {/* Live price / context panel */}
        <div className="lg:col-span-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-900/15 bg-white/70 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-amber-800 backdrop-blur">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Harga Langsung
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-900">Lock &amp; Beli Emas 916</h1>
          <p className="mt-2 max-w-sm text-sm text-zinc-500">
            Kunci harga semasa serta-merta dan bayar dengan selamat — gram dikreditkan ke Gold Wallet anda sebaik
            pembayaran disahkan.
          </p>

          <div className="mt-6 rounded-3xl border border-amber-900/10 bg-white/80 p-6 shadow-sm backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-zinc-400">Harga Emas 916 / gram</p>
            <p className="mt-1 bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-600 bg-clip-text text-4xl font-bold tabular-nums text-transparent">
              {price ? `RM${price.sellPrice916}` : "—"}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Dikemaskini oleh Miragold hari ini
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <TrustRow icon="⏱️" title="Lock window terhad" desc="Harga dikunci sebentar sehingga bayaran selesai." />
            <TrustRow icon="💳" title="Pembayaran oleh Billplz" desc="Payment gateway berdaftar & dipercayai." />
            <TrustRow icon="📒" title="Log audit tidak boleh diubah" desc="Setiap transaksi direkod secara kekal." />
          </div>
        </div>

        {/* Order form panel */}
        <div className="lg:col-span-3">
          <div className="relative overflow-hidden rounded-3xl border border-amber-900/10 bg-white/80 p-8 shadow-[0_8px_40px_-12px_rgba(120,53,15,0.15)] backdrop-blur">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />

            <p className="text-xs font-medium uppercase tracking-widest text-amber-800">Pilih Jumlah</p>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAmount(a.value)}
                  className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-sm transition ${
                    amount === a.value
                      ? "border-amber-900 bg-gradient-to-b from-amber-800 to-amber-950 text-white shadow-md shadow-amber-900/20"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-amber-900/40 hover:shadow-sm"
                  }`}
                >
                  <span className="text-base leading-none">{a.icon}</span>
                  <span className="font-medium">RM{a.value}</span>
                </button>
              ))}
            </div>

            <label className="mt-5 block text-sm font-medium text-zinc-700">
              Jumlah lain (RM)
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-400">
                  RM
                </span>
                <input
                  type="number"
                  min={100}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-300 py-2.5 pl-10 pr-3 outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                />
              </div>
            </label>

            <div className="mt-6 rounded-2xl border border-dashed border-amber-900/20 bg-amber-50/50 p-5 text-sm">
              <p className="text-xs font-medium uppercase tracking-widest text-amber-800">Ringkasan Pesanan</p>
              <div className="mt-3 flex justify-between">
                <span className="text-zinc-500">Jumlah bayar</span>
                <span className="font-semibold tabular-nums">RM{amount.toFixed(2)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-amber-900/10 pt-2">
                <span className="text-zinc-500">Gram diterima (anggaran)</span>
                <span className="font-semibold tabular-nums text-amber-900">{gram} g</span>
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <button
              onClick={lockAndPay}
              disabled={busy || amount < 100 || !price}
              className="group relative mt-6 w-full overflow-hidden rounded-full bg-gradient-to-r from-amber-800 to-amber-950 px-6 py-3.5 font-medium text-white shadow-lg shadow-amber-900/25 transition hover:from-amber-700 hover:to-amber-900 disabled:opacity-50 disabled:shadow-none"
            >
              {!busy && <span className="shimmer-sweep" />}
              <span className="relative inline-flex items-center gap-2">
                <span>🔒</span>
                {busy ? "Memproses..." : "Lock Harga & Bayar (Billplz)"}
              </span>
            </button>

            <p className="mt-4 text-center text-xs text-zinc-400">
              Harga akan dikunci sebentar (lock window) sehingga anda selesai bayar. Gram hanya dikreditkan selepas
              pembayaran disahkan oleh Billplz.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function TrustRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-900/10 bg-white text-base shadow-sm">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-zinc-800">{title}</p>
        <p className="text-xs text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}
