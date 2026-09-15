"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PriceRow = {
  id: string;
  sellPrice916: string;
  buybackPrice916: string;
  effectiveAt: string;
};

export default function AdminPricePage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sell, setSell] = useState("");
  const [buyback, setBuyback] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmNeeded, setConfirmNeeded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) {
          router.replace("/login?next=/admin/price");
        } else if (!["ADMIN", "OWNER"].includes(d.user.role)) {
          router.replace("/wallet");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!me || !["ADMIN", "OWNER"].includes(me.role)) return;
    let cancelled = false;

    async function run() {
      const res = await fetch("/api/admin/price");
      if (cancelled) return;
      if (!res.ok) {
        setError("Gagal memuatkan sejarah harga");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setPrices(data.prices);
      if (data.prices[0]) {
        setSell(data.prices[0].sellPrice916);
        setBuyback(data.prices[0].buybackPrice916);
      }
      setLoading(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [me]);

  async function submitPrice(force: boolean) {
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellPrice916: Number(sell), buybackPrice916: Number(buyback) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));

      if (data.warning && !force) {
        // Spec 16.6: unusual (>10%) change gets a confirm step instead of
        // silently going live.
        setWarning(data.warning);
        setConfirmNeeded(true);
        setBusy(false);
        return;
      }

      setWarning(null);
      setConfirmNeeded(false);
      setPrices((prev) => [data.price, ...prev]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (me === undefined) return null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <Link href="/admin" className="text-sm text-amber-900 hover:underline">
        ← Panel Admin
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Urus Harga Emas 916</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Harga baharu terpakai serta-merta untuk order akan datang. Order yang harganya sudah dikunci (checkout
        sedia ada) tidak terjejas.
      </p>

      <div className="mt-6 rounded-2xl border border-amber-900/10 bg-white p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700">
            Harga Jual (RM/gram)
            <input
              type="number"
              step="0.01"
              value={sell}
              onChange={(e) => {
                setSell(e.target.value);
                setConfirmNeeded(false);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Harga Beli Balik (RM/gram)
            <input
              type="number"
              step="0.01"
              value={buyback}
              onChange={(e) => {
                setBuyback(e.target.value);
                setConfirmNeeded(false);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
        </div>

        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
        {warning && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
            ⚠️ {warning}
          </p>
        )}

        {!confirmNeeded ? (
          <button
            onClick={() => submitPrice(false)}
            disabled={busy || !sell || !buyback}
            className="mt-4 rounded-full bg-amber-900 px-5 py-2.5 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Mengemaskini..." : "Kemaskini Harga"}
          </button>
        ) : (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => submitPrice(true)}
              disabled={busy}
              className="rounded-full bg-red-700 px-5 py-2.5 font-medium text-white disabled:opacity-50"
            >
              Ya, Sahkan Perubahan
            </button>
            <button
              onClick={() => {
                setConfirmNeeded(false);
                setWarning(null);
              }}
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-zinc-700"
            >
              Batal
            </button>
          </div>
        )}
      </div>

      <h2 className="mt-8 text-lg font-medium text-zinc-900">Sejarah Harga</h2>
      {loading && <p className="mt-2 text-zinc-400">Memuatkan...</p>}
      {error && <p className="mt-2 text-red-600">{error}</p>}

      {!loading && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2">Tarikh</th>
                <th className="px-3 py-2">Jual (RM/g)</th>
                <th className="px-3 py-2">Beli Balik (RM/g)</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-500">{new Date(p.effectiveAt).toLocaleString("ms-MY")}</td>
                  <td className="px-3 py-2">RM{p.sellPrice916}</td>
                  <td className="px-3 py-2">RM{p.buybackPrice916}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
