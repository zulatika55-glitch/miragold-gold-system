"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Row = {
  redemptionRef: string;
  createdAt: string;
  productName: string;
  sku: string;
  itemWeightGram: string;
  gramUsed: string;
  shortfallGram: string;
  totalPaymentRm: string;
  deliveryMethod: string;
  status: string;
  customerName: string;
  customerPhone: string;
  customerId: string;
};

type Summary = {
  onHold: string;
  awaitingCustomer: number;
  awaitingPayment: number;
  processing: number;
  readyForFulfillment: number;
  completed: number;
  cancelled: number;
};

const STATUS_LABEL: Record<string, string> = {
  AWAITING_CUSTOMER_CONFIRMATION: "Menunggu Customer Sahkan",
  PENDING_CONFIRMATION: "Menunggu OTP",
  AWAITING_PAYMENT: "Menunggu Bayaran",
  PAYMENT_CONFIRMED: "Bayaran Disahkan",
  PROCESSING: "Diproses",
  READY_FOR_FULFILLMENT: "Sedia Diambil/Dihantar",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Tamat Tempoh",
};

const STATUS_STYLE: Record<string, string> = {
  AWAITING_PAYMENT: "border-amber-200 bg-amber-50 text-amber-800",
  PAYMENT_CONFIRMED: "border-sky-200 bg-sky-50 text-sky-800",
  PROCESSING: "border-sky-200 bg-sky-50 text-sky-800",
  READY_FOR_FULFILLMENT: "border-violet-200 bg-violet-50 text-violet-800",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REJECTED: "border-red-200 bg-red-50 text-red-800",
  CANCELLED: "border-red-200 bg-red-50 text-red-800",
  EXPIRED: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const FILTER_STATUSES = [
  "AWAITING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PROCESSING",
  "READY_FOR_FULFILLMENT",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
];

type CreateForm = {
  customerQuery: string;
  productName: string;
  sku: string;
  itemWeightGram: string;
  upahOverride: boolean;
  upahRm: string;
  upahOverrideReason: string;
  otherChargesRm: string;
  postageRm: string;
  deliveryMethod: "PICKUP" | "DELIVERY";
  address: string;
  deliveryPhone: string;
  note: string;
  notes: string;
};

const EMPTY_FORM: CreateForm = {
  customerQuery: "",
  productName: "",
  sku: "",
  itemWeightGram: "",
  upahOverride: false,
  upahRm: "",
  upahOverrideReason: "",
  otherChargesRm: "",
  postageRm: "",
  deliveryMethod: "PICKUP",
  address: "",
  deliveryPhone: "",
  note: "",
  notes: "",
};

export default function AdminRedemptionPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string } | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const load = useCallback(async (search: string, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/redemption${params.toString() ? `?${params}` : ""}`);
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        return;
      }
      if (!res.ok) throw new Error("Gagal memuatkan senarai redemption");
      const data = await res.json();
      setRows(data.redemptions);
      setSummary(data.summary);
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
          router.replace("/login?next=/admin/redemption");
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
      const res = await fetch("/api/admin/redemption");
      if (cancelled) return;
      if (res.status === 403) {
        setError("Akses ditolak — akaun ini bukan admin.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Gagal memuatkan senarai redemption");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setRows(data.redemptions);
      setSummary(data.summary);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [me]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateBusy(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const body: Record<string, unknown> = {
        customerQuery: form.customerQuery,
        productName: form.productName,
        sku: form.sku,
        itemWeightGram: Number(form.itemWeightGram),
        deliveryMethod: form.deliveryMethod,
      };
      if (form.upahOverride && form.upahRm !== "") {
        body.upahRm = Number(form.upahRm);
        if (form.upahOverrideReason) body.upahOverrideReason = form.upahOverrideReason;
      }
      if (form.otherChargesRm) body.otherChargesRm = Number(form.otherChargesRm);
      if (form.postageRm) body.postageRm = Number(form.postageRm);
      if (form.deliveryMethod === "DELIVERY" && (form.address || form.deliveryPhone || form.note)) {
        body.deliveryDetails = {
          address: form.address || undefined,
          phone: form.deliveryPhone || undefined,
          note: form.note || undefined,
        };
      }
      if (form.notes) body.notes = form.notes;

      const res = await fetch("/api/admin/redemption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal cipta quotation");
      setCreateSuccess(`Quotation ${data.redemption.redemptionRef} berjaya dicipta.`);
      setForm(EMPTY_FORM);
      await load(q, statusFilter);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateBusy(false);
    }
  }

  if (me === undefined) return null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Panel Admin
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/10 text-lg">💍</span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Tebus Barang Kemas</h1>
            <p className="text-sm text-zinc-500">Cipta quotation tebusan & jejak setiap redemption customer.</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-800"
        >
          {showCreate ? "Tutup Borang" : "+ Create Redemption"}
        </button>
      </div>

      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Gold On Hold" value={`${summary.onHold} g`} accent />
          <SummaryCard label="Menunggu Bayaran" value={summary.awaitingPayment} warn={summary.awaitingPayment > 0} />
          <SummaryCard label="Sedang Diproses" value={summary.processing} />
          <SummaryCard label="Sedia Diambil/Dihantar" value={summary.readyForFulfillment} warn={summary.readyForFulfillment > 0} />
          <SummaryCard label="Menunggu Customer" value={summary.awaitingCustomer} />
          <SummaryCard label="Selesai" value={summary.completed} />
          <SummaryCard label="Ditolak/Dibatalkan/Tamat" value={summary.cancelled} />
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={submitCreate}
          className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-amber-900/10 bg-white p-6 sm:grid-cols-2"
        >
          <h2 className="col-span-full text-lg font-medium text-zinc-900">Create Redemption / Tebus Barang Kemas</h2>

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
            Nama Produk
            <input
              required
              value={form.productName}
              onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              placeholder="Cth: Rantai Emas 916"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            SKU
            <input
              required
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium text-zinc-700">
            Berat Barang Sebenar (gram)
            <input
              required
              type="number"
              step="0.0001"
              min="0.0001"
              value={form.itemWeightGram}
              onChange={(e) => setForm((f) => ({ ...f, itemWeightGram: e.target.value }))}
              placeholder="Berat unit sebenar, bukan anggaran design"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Kaedah Penghantaran
            <select
              value={form.deliveryMethod}
              onChange={(e) => setForm((f) => ({ ...f, deliveryMethod: e.target.value as "PICKUP" | "DELIVERY" }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            >
              <option value="PICKUP">Ambil Sendiri (Pickup)</option>
              <option value="DELIVERY">Penghantaran (Delivery)</option>
            </select>
          </label>

          {form.deliveryMethod === "DELIVERY" && (
            <>
              <label className="text-sm font-medium text-zinc-700 sm:col-span-2">
                Alamat Penghantaran
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium text-zinc-700">
                No. Telefon Penerima
                <input
                  value={form.deliveryPhone}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryPhone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium text-zinc-700">
                Nota Penghantaran
                <input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
            </>
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.upahOverride}
              onChange={(e) => setForm((f) => ({ ...f, upahOverride: e.target.checked }))}
            />
            Override Upah (default: guna Kadar Upah semasa × berat barang)
          </label>
          {form.upahOverride && (
            <>
              <label className="text-sm font-medium text-zinc-700">
                Upah (RM) — jumlah keseluruhan
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.upahRm}
                  onChange={(e) => setForm((f) => ({ ...f, upahRm: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium text-zinc-700">
                Sebab Override
                <input
                  value={form.upahOverrideReason}
                  onChange={(e) => setForm((f) => ({ ...f, upahOverrideReason: e.target.value }))}
                  placeholder="Cth: produk custom, struktur upah berbeza"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
            </>
          )}

          <label className="text-sm font-medium text-zinc-700">
            Caj Lain (RM, opsyenal)
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.otherChargesRm}
              onChange={(e) => setForm((f) => ({ ...f, otherChargesRm: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Postage (RM, opsyenal)
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.postageRm}
              onChange={(e) => setForm((f) => ({ ...f, postageRm: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium text-zinc-700 sm:col-span-2">
            Nota Staff (opsyenal)
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              rows={2}
            />
          </label>

          {createError && <p className="col-span-full text-sm text-red-600">{createError}</p>}
          {createSuccess && <p className="col-span-full text-sm text-emerald-700">{createSuccess}</p>}
          <button
            disabled={createBusy}
            className="col-span-full mt-2 rounded-full bg-amber-900 px-4 py-2 font-medium text-white transition hover:bg-amber-800 disabled:opacity-50 sm:w-fit"
          >
            {createBusy ? "Menyimpan..." : "Cipta Quotation"}
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q, statusFilter)}
          placeholder="Cari nama / phone / customer ID / SKU / rujukan..."
          className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            void load(q, e.target.value);
          }}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Semua status (kecuali Menunggu Customer)</option>
          {FILTER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>
        <button
          onClick={() => load(q, statusFilter)}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-amber-900/40"
        >
          Cari
        </button>
      </div>

      {error && <p className="mt-4 text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-zinc-400">Memuatkan...</p>}

      {!loading && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2">Tarikh</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Produk</th>
                <th className="px-3 py-2">Gram Wallet / Berat</th>
                <th className="px-3 py-2">Bayaran RM</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Rujukan</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-zinc-400">
                    Tiada redemption dijumpai.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.redemptionRef}
                  onClick={() => router.push(`/admin/redemption/${r.redemptionRef}`)}
                  className="cursor-pointer border-t border-zinc-100 odd:bg-white even:bg-zinc-50/50 hover:bg-amber-50/40"
                >
                  <td className="px-3 py-2 text-zinc-500">{new Date(r.createdAt).toLocaleString("ms-MY")}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">{r.customerName}</div>
                    <div className="text-xs text-zinc-400">
                      {r.customerPhone} · {r.customerId}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-zinc-800">{r.productName}</div>
                    <div className="text-xs text-zinc-400">{r.sku}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-amber-900">
                    {r.gramUsed}g / {r.itemWeightGram}g
                  </td>
                  <td className="px-3 py-2 font-medium tabular-nums">RM{r.totalPaymentRm}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status] ?? "border-zinc-200 bg-zinc-50 text-zinc-500"}`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{r.redemptionRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ label, value, warn, accent }: { label: string; value: string | number; warn?: boolean; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${warn ? "border-red-200 bg-red-50" : accent ? "border-amber-900/20 bg-amber-900/5" : "border-amber-900/10 bg-white"}`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${warn ? "text-red-700" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
}
