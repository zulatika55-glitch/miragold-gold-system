"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PriceInfo = { sellPrice916: string; minimumAmountRm: string; effectiveAt: string };

type LockedOrder = {
  orderRef: string;
  amountRm: string;
  priceSnapshot: string;
  gram: string;
  lockExpiresAt: string;
  paymentUrl: string;
};

const QUICK_AMOUNTS = [
  { value: 100, icon: "🌱" },
  { value: 200, icon: "🪙" },
  { value: 350, icon: "✨" },
  { value: 500, icon: "💎" },
  { value: 1000, icon: "👑" },
];

function formatUpdatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ms-MY", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [amount, setAmount] = useState<number>(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedOrder, setLockedOrder] = useState<LockedOrder | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(0);

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

  // Live countdown for the price-lock window shown on the review step.
  useEffect(() => {
    if (!lockedOrder) return;
    const tick = () => {
      const secs = Math.max(0, Math.round((new Date(lockedOrder.lockExpiresAt).getTime() - Date.now()) / 1000));
      setRemainingSec(secs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedOrder]);

  const gram = price ? (amount / Number(price.sellPrice916)).toFixed(2) : "-";

  async function createLock() {
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
      setLockedOrder({ ...data.order, paymentUrl: data.paymentUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function proceedToPayment() {
    if (lockedOrder) window.location.href = lockedOrder.paymentUrl;
  }

  function cancelLock() {
    setLockedOrder(null);
    setError(null);
  }

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");

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
              {price ? `Dikemaskini: ${formatUpdatedAt(price.effectiveAt)}` : "Memuatkan..."}
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

            {!lockedOrder ? (
              <>
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
                  <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                  </p>
                )}

                <button
                  onClick={createLock}
                  disabled={busy || amount < 100 || !price}
                  className="group relative mt-6 w-full overflow-hidden rounded-full bg-gradient-to-r from-amber-800 to-amber-950 px-6 py-3.5 font-medium text-white shadow-lg shadow-amber-900/25 transition hover:from-amber-700 hover:to-amber-900 disabled:opacity-50 disabled:shadow-none"
                >
                  {!busy && <span className="shimmer-sweep" />}
                  <span className="relative inline-flex items-center gap-2">
                    <span>🔒</span>
                    {busy ? "Mengunci harga..." : "Lock Harga"}
                  </span>
                </button>

                <p className="mt-4 text-center text-xs text-zinc-400">
                  Harga akan dikunci sebentar (lock window) sehingga anda selesai bayar. Gram hanya dikreditkan
                  selepas pembayaran disahkan oleh Billplz.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-widest text-amber-800">Semakan Lock Harga</p>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${
                      remainingSec > 0 ? "bg-amber-900 text-white" : "bg-red-100 text-red-700"
                    }`}
                  >
                    ⏱️ {remainingSec > 0 ? `${mm}:${ss}` : "Tamat tempoh"}
                  </span>
                </div>

                <div className="mt-4 divide-y divide-amber-900/10 rounded-2xl border border-amber-900/10 bg-amber-50/50 text-sm">
                  <Row label="Lock ID" value={lockedOrder.orderRef} mono />
                  <Row label="Harga dikunci (RM/g)" value={`RM${lockedOrder.priceSnapshot}`} />
                  <Row label="Jumlah bayar" value={`RM${Number(lockedOrder.amountRm).toFixed(2)}`} />
                  <Row label="Gram diterima" value={`${lockedOrder.gram} g`} highlight />
                  <Row label="Tempoh lock" value={`${mm}:${ss} minit:saat baki`} />
                </div>

                {remainingSec > 0 ? (
                  <>
                    <button
                      onClick={proceedToPayment}
                      className="group relative mt-6 w-full overflow-hidden rounded-full bg-gradient-to-r from-amber-800 to-amber-950 px-6 py-3.5 font-medium text-white shadow-lg shadow-amber-900/25 transition hover:from-amber-700 hover:to-amber-900"
                    >
                      <span className="shimmer-sweep" />
                      <span className="relative inline-flex items-center gap-2">
                        <span>💳</span>
                        Teruskan ke Billplz
                      </span>
                    </button>
                    <button
                      onClick={cancelLock}
                      className="mt-3 w-full text-center text-xs text-zinc-400 hover:text-amber-800 hover:underline"
                    >
                      Batal &amp; tukar jumlah
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-600">
                      Lock harga telah tamat tempoh. Sila lock semula untuk dapatkan harga terkini.
                    </p>
                    <button
                      onClick={cancelLock}
                      className="mt-3 w-full rounded-full border border-amber-900/20 px-6 py-3 text-sm font-medium text-amber-900 hover:bg-amber-50"
                    >
                      Lock Semula
                    </button>
                  </>
                )}

                {error && (
                  <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-zinc-500">{label}</span>
      <span
        className={`font-semibold tabular-nums ${mono ? "font-mono text-xs" : ""} ${
          highlight ? "text-amber-900" : "text-zinc-800"
        }`}
      >
        {value}
      </span>
    </div>
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
