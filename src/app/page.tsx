"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PriceInfo = {
  sellPrice916: string;
  buybackPrice916: string;
  rm100Equivalent: string;
  minimumAmountRm: string;
  effectiveAt: string;
};

export default function Home() {
  const router = useRouter();
  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/price")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load price");
        return r.json();
      })
      .then(setPrice)
      .catch((e) => setError(e.message));
  }, []);

  async function handleCta() {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (!me.user) {
      router.push("/login?next=/checkout");
    } else {
      router.push("/checkout");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6 py-16 text-center">
      <p className="text-sm uppercase tracking-widest text-amber-800">Gold Saving System</p>
      <h1 className="mt-2 text-3xl font-semibold text-zinc-900">Harga Simpanan Emas 916 Hari Ini</h1>

      {error && <p className="mt-8 text-red-600">{error}</p>}

      {!price && !error && <p className="mt-8 text-zinc-500">Memuatkan harga...</p>}

      {price && (
        <div className="mt-8 w-full rounded-2xl border border-amber-900/10 bg-white p-8 shadow-sm">
          <p className="text-sm text-zinc-500">1 gram Emas 916</p>
          <p className="text-4xl font-bold text-amber-900">RM{price.sellPrice916}</p>

          <div className="mt-4 border-t border-dashed border-zinc-200 pt-4 text-sm text-zinc-600">
            RM{price.minimumAmountRm} = {price.rm100Equivalent} gram
          </div>

          <p className="mt-2 text-xs text-zinc-400">
            Minimum transaksi RM{price.minimumAmountRm}. Harga dikemaskini{" "}
            {new Date(price.effectiveAt).toLocaleString("ms-MY")}.
          </p>

          <button
            onClick={handleCta}
            className="mt-6 w-full rounded-full bg-amber-900 px-6 py-3 font-medium text-white transition hover:bg-amber-800 sm:w-auto"
          >
            Lock Emas Sekarang
          </button>
        </div>
      )}

      <p className="mt-10 max-w-md text-xs text-zinc-400">
        Harga boleh dilihat tanpa login. Login/pendaftaran diperlukan hanya apabila anda membuat transaksi.
      </p>
    </main>
  );
}
