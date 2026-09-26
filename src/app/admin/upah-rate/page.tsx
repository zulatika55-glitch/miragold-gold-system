"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Rate = { id: string; ratePerGram: string; effectiveAt: string; createdAt: string };

export default function AdminUpahRatePage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ratePerGram, setRatePerGram] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/upah-rate");
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        return;
      }
      if (!res.ok) throw new Error("Gagal memuatkan kadar upah");
      const data = await res.json();
      setRates(data.rates);
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
          router.replace("/login?next=/admin/upah-rate");
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
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/upah-rate");
        if (cancelled) return;
        if (res.status === 403) {
          setError("Akses ditolak — akaun ini bukan admin.");
          return;
        }
        if (!res.ok) throw new Error("Gagal memuatkan kadar upah");
        const data = await res.json();
        if (cancelled) return;
        setRates(data.rates);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [me]);

  async function submitRate(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await fetch("/api/admin/upah-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratePerGram: Number(ratePerGram) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal simpan kadar upah");
      setFormSuccess(`Kadar upah baharu RM${data.rate.ratePerGram}/g berjaya disimpan.`);
      setRatePerGram("");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setFormBusy(false);
    }
  }

  if (me === undefined) return null;

  const current = rates[0];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Panel Admin
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/10 text-lg">🛠️</span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Kadar Upah</h1>
          <p className="text-sm text-zinc-500">
            Kadar upah untuk Tebus Barang Kemas — tidak pernah di-hardcode. Setiap redemption sedia ada kekal guna
            kadar yang berkuat kuasa semasa ia dicipta, walaupun kadar ini diubah kemudian.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-900/15 bg-gradient-to-br from-amber-50 to-white p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-amber-800">Kadar Semasa</p>
        <p className="mt-2 text-3xl font-bold text-zinc-900">{current ? `RM${current.ratePerGram}/g` : "Belum ditetapkan"}</p>
        {current && (
          <p className="mt-1 text-xs text-zinc-400">Berkuat kuasa sejak {new Date(current.effectiveAt).toLocaleString("ms-MY")}</p>
        )}
      </div>

      <form onSubmit={submitRate} className="mt-6 rounded-2xl border border-amber-900/10 bg-white p-6">
        <h2 className="text-lg font-medium text-zinc-900">Tetapkan Kadar Baharu</h2>
        <label className="mt-3 block text-sm font-medium text-zinc-700">
          Kadar Upah (RM per gram berat barang)
          <input
            required
            type="number"
            step="0.01"
            min="0"
            value={ratePerGram}
            onChange={(e) => setRatePerGram(e.target.value)}
            placeholder="Cth: 60.00"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
        {formSuccess && <p className="mt-3 text-sm text-emerald-700">{formSuccess}</p>}
        <button
          disabled={formBusy}
          className="mt-4 rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {formBusy ? "Menyimpan..." : "Simpan Kadar"}
        </button>
      </form>

      <h2 className="mt-8 text-lg font-medium text-zinc-900">Sejarah Kadar Upah</h2>
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-zinc-400">Memuatkan...</p>}
      {!loading && (
        <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2">Berkuat Kuasa</th>
                <th className="px-3 py-2">Kadar (RM/g)</th>
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-zinc-400">
                    Tiada kadar direkod lagi.
                  </td>
                </tr>
              )}
              {rates.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 odd:bg-white even:bg-zinc-50/50">
                  <td className="px-3 py-2 text-zinc-500">{new Date(r.effectiveAt).toLocaleString("ms-MY")}</td>
                  <td className="px-3 py-2 font-medium tabular-nums text-amber-900">RM{r.ratePerGram}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
