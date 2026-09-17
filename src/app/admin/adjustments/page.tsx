"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Adjustment = {
  ledgerRef: string;
  direction: "IN" | "OUT";
  gram: string;
  reason: string | null;
  timestamp: string;
  customerName: string;
  customerId: string;
};

export default function AdminAdjustmentsPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ customerQuery: "", direction: "IN" as "IN" | "OUT", gram: "", reason: "" });
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/adjustments");
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        setAdjustments([]);
        return;
      }
      if (!res.ok) throw new Error("Gagal memuatkan senarai adjustment");
      const data = await res.json();
      setAdjustments(data.adjustments);
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
          router.replace("/login?next=/admin/adjustments");
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
      const res = await fetch("/api/admin/adjustments");
      if (cancelled) return;
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        setAdjustments([]);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Gagal memuatkan senarai adjustment");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setAdjustments(data.adjustments);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [me]);

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await fetch("/api/admin/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerQuery: form.customerQuery,
          direction: form.direction,
          gram: Number(form.gram),
          reason: form.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      }
      setFormSuccess(`Adjustment berjaya direkod (${data.adjustment.ledgerRef}).`);
      setForm({ customerQuery: "", direction: "IN", gram: "", reason: "" });
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setFormBusy(false);
    }
  }

  if (me === undefined) return null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-12">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Panel Admin
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/10 text-lg">⚖️</span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Adjustment Wallet</h1>
          <p className="text-sm text-zinc-500">
            Baki gram TIDAK boleh diedit terus — setiap pembetulan mesti melalui adjustment ini dengan sebab &amp;
            direkod dalam audit trail.
          </p>
        </div>
      </div>

      <form
        onSubmit={submitAdjustment}
        className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-amber-900/10 bg-white p-6 sm:grid-cols-2"
      >
        <h2 className="col-span-full text-lg font-medium text-zinc-900">Buat Adjustment</h2>
        <label className="text-sm font-medium text-zinc-700 sm:col-span-2">
          Customer (phone atau Customer ID)
          <input
            required
            value={form.customerQuery}
            onChange={(e) => setForm((f) => ({ ...f, customerQuery: e.target.value }))}
            placeholder="+60123456789 atau MG-0001"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Arah
          <select
            value={form.direction}
            onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as "IN" | "OUT" }))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          >
            <option value="IN">Tambah (IN)</option>
            <option value="OUT">Tolak (OUT)</option>
          </select>
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Gram
          <input
            required
            type="number"
            step="0.00000001"
            min="0"
            value={form.gram}
            onChange={(e) => setForm((f) => ({ ...f, gram: e.target.value }))}
            placeholder="0.0000"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-zinc-700 sm:col-span-2">
          Sebab (mandatori, min. 10 aksara)
          <textarea
            required
            minLength={10}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Cth: Pembetulan selepas isu payment gateway pada 12/9 — rujuk tiket #123"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            rows={3}
          />
        </label>
        {formError && <p className="col-span-full text-sm text-red-600">{formError}</p>}
        {formSuccess && <p className="col-span-full text-sm text-emerald-700">{formSuccess}</p>}
        <button
          disabled={formBusy}
          className="col-span-full mt-2 rounded-full bg-amber-900 px-4 py-2 font-medium text-white transition hover:bg-amber-800 disabled:opacity-50 sm:w-fit"
        >
          {formBusy ? "Menyimpan..." : "Rekod Adjustment"}
        </button>
      </form>

      <h2 className="mt-8 text-lg font-medium text-zinc-900">Sejarah Adjustment (100 terkini)</h2>

      {error && <p className="mt-4 text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-zinc-400">Memuatkan...</p>}

      {!loading && (
        <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2">Tarikh</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Gram</th>
                <th className="px-3 py-2">Sebab</th>
                <th className="px-3 py-2">Rujukan</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                    Tiada adjustment lagi.
                  </td>
                </tr>
              )}
              {adjustments.map((a) => (
                <tr key={a.ledgerRef} className="border-t border-zinc-100 odd:bg-white even:bg-zinc-50/50">
                  <td className="px-3 py-2 text-zinc-500">{new Date(a.timestamp).toLocaleString("ms-MY")}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">{a.customerName}</div>
                    <div className="text-xs text-zinc-400">{a.customerId}</div>
                  </td>
                  <td className={`px-3 py-2 font-medium ${a.direction === "IN" ? "text-green-700" : "text-red-700"}`}>
                    {a.direction === "IN" ? "+" : "-"}
                    {a.gram} g
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{a.reason ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{a.ledgerRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
