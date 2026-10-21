"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Advanced Dashboard — "Dashboard Simpanan Saya" (sir zul, Master
// Instruction 21/10, approved STEP 2 proposal). This is an ADDITIONAL page,
// not a replacement for /wallet: every figure here is read from the same
// APIs /wallet already uses (plus three small new read-mostly endpoints for
// target/plan, the ledger chart, and price history) — nothing here writes
// to wallet_ledger, touches Gold Hold, or changes calculation. Colour
// palette matches the rest of the app (amber-900/zinc/white) per sir zul's
// decision to keep brand consistency rather than introduce a new accent.

type WalletData = { balanceGram: string; gramOnHold: string; totalGram: string; history: LedgerEntry[] };
type LedgerEntry = {
  ledgerRef: string;
  type: string;
  direction: "IN" | "OUT";
  gram: string;
  balanceAfter: string;
  timestamp: string;
};
type PriceInfo = { sellPrice916: string; buybackPrice916: string; effectiveAt: string };
type Target = { targetGram: string; monthlyBudgetRm: string | null; updatedAt: string } | null;
type ChartPoint = { date: string; balanceGram: string };
type PriceHistoryPoint = { effectiveAt: string; sellPrice916: string; buybackPrice916: string };

const LEDGER_TYPE_LABEL: Record<string, string> = {
  LOCK_BUY: "Beli Emas 916",
  REDEMPTION: "Tebus Barang Kemas",
  BUYBACK: "Jual Emas",
  CONVERSION: "Penukaran",
  TRADE_IN: "Tukar Barang",
  ADJUSTMENT: "Pelarasan",
  REVERSAL: "Pembatalan",
};

const MILESTONES = [1, 5, 10, 20, 50];
const PERIODS: { key: string; label: string }[] = [
  { key: "1m", label: "1 bulan" },
  { key: "3m", label: "3 bulan" },
  { key: "6m", label: "6 bulan" },
  { key: "1y", label: "1 tahun" },
  { key: "all", label: "Semua" },
];
const QUICK_TARGETS = [1, 5, 10, 20, 50];
const QUICK_AMOUNTS = [50, 100, 300, 500];

function buildPolyline(values: number[], width: number, height: number, pad = 8): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `${pad},${height - pad} ${width - pad},${height - pad}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function SavingsDashboardPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [target, setTarget] = useState<Target>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [period, setPeriod] = useState("6m");
  const [error, setError] = useState<string | null>(null);

  const [targetForm, setTargetForm] = useState({ gram: "20", budget: "300" });
  const [savingTarget, setSavingTarget] = useState(false);
  const [calcAmount, setCalcAmount] = useState("100");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [walletRes, priceRes, targetRes, priceHistRes] = await Promise.all([
        fetch("/api/wallet"),
        fetch("/api/price"),
        fetch("/api/wallet/savings-target"),
        fetch("/api/price/history"),
      ]);
      if (cancelled) return;
      if (walletRes.status === 401) {
        router.replace("/login?next=/wallet/dashboard");
        return;
      }
      if (!walletRes.ok) {
        setError("Gagal memuatkan dashboard");
        return;
      }
      setWallet(await walletRes.json());
      if (priceRes.ok) setPrice(await priceRes.json());
      if (targetRes.ok) {
        const data = await targetRes.json();
        setTarget(data.target);
        if (data.target) {
          setTargetForm({
            gram: data.target.targetGram,
            budget: data.target.monthlyBudgetRm ?? "",
          });
        }
      }
      if (priceHistRes.ok) setPriceHistory((await priceHistRes.json()).points);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/wallet/history-chart?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setChartPoints(d.points);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  async function saveTarget() {
    const gram = Number(targetForm.gram);
    const budget = targetForm.budget.trim() ? Number(targetForm.budget) : null;
    if (!gram || gram <= 0) return;
    setSavingTarget(true);
    try {
      const res = await fetch("/api/wallet/savings-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGram: gram, monthlyBudgetRm: budget }),
      });
      if (res.ok) {
        const data = await res.json();
        setTarget(data.target);
      }
    } finally {
      setSavingTarget(false);
    }
  }

  const totalGram = Number(wallet?.totalGram ?? 0);
  const availableGram = Number(wallet?.balanceGram ?? 0);
  const onHoldGram = Number(wallet?.gramOnHold ?? 0);
  const buybackPrice = Number(price?.buybackPrice916 ?? 0);
  const sellPrice = Number(price?.sellPrice916 ?? 0);
  const estimatedValue = availableGram * buybackPrice;

  const targetGram = target ? Number(target.targetGram) : null;
  const progressPct = targetGram ? Math.min(100, (totalGram / targetGram) * 100) : null;
  const remainingGram = targetGram ? Math.max(0, targetGram - totalGram) : null;

  const monthlyBudget = target?.monthlyBudgetRm ? Number(target.monthlyBudgetRm) : null;
  const monthsNeeded =
    targetGram && monthlyBudget && sellPrice > 0 && remainingGram && remainingGram > 0
      ? Math.ceil((remainingGram * sellPrice) / monthlyBudget)
      : null;

  const calcGram = sellPrice > 0 && Number(calcAmount) > 0 ? Number(calcAmount) / sellPrice : 0;

  const chartPolyline = useMemo(
    () => buildPolyline(chartPoints.map((p) => Number(p.balanceGram)), 760, 180),
    [chartPoints],
  );
  const priceHistPolyline = useMemo(
    () => buildPolyline(priceHistory.map((p) => Number(p.sellPrice916)), 760, 140),
    [priceHistory],
  );
  const buybackHistPolyline = useMemo(
    () => buildPolyline(priceHistory.map((p) => Number(p.buybackPrice916)), 760, 140),
    [priceHistory],
  );

  const recentHistory = (wallet?.history ?? []).slice(0, 12);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-16 pt-8">
      <Link href="/wallet" className="text-sm text-zinc-500 hover:text-amber-900">
        &larr; Kembali ke Gold Wallet
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Dashboard Simpanan Saya</h1>
          <p className="mt-1 text-sm text-zinc-500">Pantau sasaran, perkembangan dan nilai simpanan Emas 916 anda.</p>
        </div>
      </div>

      {error && <p className="mt-6 text-red-600">{error}</p>}

      {!wallet && !error && <p className="mt-8 text-zinc-500">Memuatkan dashboard...</p>}

      {wallet && (
        <div className="mt-6 flex flex-col gap-7">
          {/* Ringkasan Simpanan */}
          <section>
            <h2 className="text-sm font-semibold text-zinc-900">Ringkasan Simpanan</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-amber-900/10 bg-white p-5">
                <p className="text-xs text-zinc-500">Jumlah Emas</p>
                <p className="mt-1.5 text-xl font-bold text-zinc-900">{totalGram.toFixed(4)} g</p>
              </div>
              <div className="rounded-2xl border border-amber-900/10 bg-white p-5">
                <p className="text-xs text-zinc-500">Emas Tersedia</p>
                <p className="mt-1.5 text-xl font-bold text-zinc-900">{availableGram.toFixed(4)} g</p>
              </div>
              <div className="rounded-2xl border border-amber-900/10 bg-white p-5">
                <p className="text-xs text-zinc-500">Emas Dalam Hold</p>
                <p className="mt-1.5 text-xl font-bold text-amber-900">{onHoldGram.toFixed(4)} g</p>
              </div>
              <div className="rounded-2xl border border-amber-900/10 bg-white p-5">
                <p className="text-xs text-zinc-500">Anggaran Nilai Jual Balik</p>
                <p className="mt-1.5 text-xl font-bold text-zinc-900">RM{estimatedValue.toFixed(2)}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              Jumlah Emas = Emas Tersedia + Emas Dalam Hold. Nilai RM adalah anggaran, bukan baki tunai tetap.
            </p>
          </section>

          {/* Sasaran dan Progress */}
          <section className="rounded-2xl border border-amber-900/10 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Sasaran Simpanan Emas</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_TARGETS.map((g) => (
                <button
                  key={g}
                  onClick={() => setTargetForm((f) => ({ ...f, gram: String(g) }))}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    Number(targetForm.gram) === g
                      ? "border-amber-900 bg-amber-900 text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-amber-900/30 hover:text-amber-900"
                  }`}
                >
                  {g}g
                </button>
              ))}
              <input
                type="number"
                min="0"
                step="0.0001"
                value={targetForm.gram}
                onChange={(e) => setTargetForm((f) => ({ ...f, gram: e.target.value }))}
                className="w-28 rounded-full border border-zinc-200 px-3.5 py-1.5 text-sm"
                aria-label="Sasaran gram custom"
              />
              <button
                onClick={saveTarget}
                disabled={savingTarget}
                className="rounded-full bg-amber-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingTarget ? "Menyimpan..." : "Simpan Sasaran"}
              </button>
            </div>

            {targetGram ? (
              <div className="mt-5 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-zinc-600">
                    {totalGram.toFixed(4)} g daripada sasaran {targetGram.toFixed(4)} g
                  </span>
                  <span className="font-semibold text-amber-900">{progressPct?.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-amber-900" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="text-sm text-zinc-500">
                  Baki diperlukan: <strong className="text-zinc-900">{remainingGram?.toFixed(4)} g</strong> lagi.
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-400">Tetapkan sasaran gram untuk mula jejak progress anda.</p>
            )}
          </section>

          {/* Graf Perkembangan */}
          <section className="rounded-2xl border border-amber-900/10 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">Graf Perkembangan Simpanan</h2>
              <div className="flex gap-1.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      period === p.key ? "bg-amber-900 text-white" : "bg-zinc-100 text-zinc-500 hover:text-amber-900"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {chartPoints.length > 0 ? (
              <svg viewBox="0 0 760 180" className="mt-4 h-44 w-full" role="img" aria-label="Graf perkembangan baki emas">
                <polyline points={chartPolyline} fill="none" stroke="#78350f" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <p className="mt-6 text-sm text-zinc-400">Tiada transaksi dalam tempoh ini.</p>
            )}
            <p className="mt-2 text-xs text-zinc-400">Dikira daripada transaksi yang berstatus selesai sahaja.</p>
          </section>

          {/* Kalkulator & Pelan Bulanan */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-900/10 bg-white p-6">
              <h2 className="text-sm font-semibold text-zinc-900">Kalkulator Simpanan</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setCalcAmount(String(a))}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:border-amber-900/30 hover:text-amber-900"
                  >
                    RM{a}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-xs text-zinc-500" htmlFor="calc-amount">
                Bajet (RM)
              </label>
              <input
                id="calc-amount"
                type="number"
                min="0"
                value={calcAmount}
                onChange={(e) => setCalcAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <p className="mt-3 text-sm text-zinc-600">
                Anggaran: <strong className="text-zinc-900">{calcGram.toFixed(4)} g</strong> pada Harga Jual 916 semasa
                (RM{sellPrice.toFixed(2)}/g)
              </p>
              <p className="mt-2 text-xs text-zinc-400">Simulasi sahaja — bukan price lock atau transaksi pembelian.</p>
            </div>
            <div className="rounded-2xl border border-amber-900/10 bg-white p-6">
              <h2 className="text-sm font-semibold text-zinc-900">Pelan Simpanan Bulanan</h2>
              <label className="mt-3 block text-xs text-zinc-500" htmlFor="plan-budget">
                Bajet bulanan (RM)
              </label>
              <input
                id="plan-budget"
                type="number"
                min="0"
                value={targetForm.budget}
                onChange={(e) => setTargetForm((f) => ({ ...f, budget: e.target.value }))}
                onBlur={saveTarget}
                placeholder="cth. 300"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              {monthsNeeded != null ? (
                <div className="mt-4 rounded-xl bg-amber-900/5 p-4">
                  <p className="text-xs text-zinc-500">Anggaran tempoh diperlukan</p>
                  <p className="mt-1 text-xl font-bold text-amber-900">&asymp; {monthsNeeded} bulan</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-400">Isi sasaran dan bajet bulanan untuk lihat anggaran tempoh.</p>
              )}
              <p className="mt-2 text-xs text-zinc-400">Perancangan sahaja — tiada auto-debit atau lock harga.</p>
            </div>
          </section>

          {/* Analisis Nilai Emas */}
          <section className="rounded-2xl border border-amber-900/10 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Analisis Nilai Emas</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-zinc-500">Harga Buyback 916 Semasa</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">RM{buybackPrice.toFixed(2)} / g</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Anggaran Nilai Jual Balik</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">RM{estimatedValue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Kos Pembelian (Rekod Sebenar)</p>
                <p className="mt-1 text-lg font-semibold text-zinc-400">Data belum mencukupi</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              Perbandingan untung/rugi dipaparkan hanya apabila kaedah pengiraan kos sah dan konsisten.
            </p>
          </section>

          {/* Milestone */}
          <section>
            <h2 className="text-sm font-semibold text-zinc-900">Milestone Simpanan</h2>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {MILESTONES.map((m) => {
                const achieved = totalGram >= m;
                return (
                  <div
                    key={m}
                    className={`rounded-xl border border-amber-900/10 bg-white p-4 text-center ${achieved ? "" : "opacity-60"}`}
                  >
                    <p className={`text-lg font-bold ${achieved ? "text-emerald-700" : "text-zinc-400"}`}>{m}g</p>
                    <p className="mt-1 text-[11px] text-zinc-400">{achieved ? "Dicapai" : "Belum Dicapai"}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-zinc-400">Milestone berbentuk motivasi sahaja, bukan ganjaran kewangan automatik.</p>
          </section>

          {/* Sejarah Harga */}
          <section className="rounded-2xl border border-amber-900/10 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Sejarah Harga Emas 916</h2>
            {priceHistory.length > 1 ? (
              <>
                <svg viewBox="0 0 760 140" className="mt-4 h-36 w-full" role="img" aria-label="Graf sejarah harga jual dan buyback 916">
                  <polyline points={priceHistPolyline} fill="none" stroke="#78350f" strokeWidth={2.5} />
                  <polyline points={buybackHistPolyline} fill="none" stroke="#a1a1aa" strokeWidth={2.5} strokeDasharray="4 4" />
                </svg>
                <div className="mt-2 flex gap-5 text-xs text-zinc-600">
                  <span>
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-900" />
                    Harga Jual 916
                  </span>
                  <span>
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-zinc-400" />
                    Harga Buyback 916
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-zinc-400">Belum cukup rekod harga untuk papar graf.</p>
            )}
          </section>

          {/* Penyata & Aktiviti */}
          <section className="rounded-2xl border border-amber-900/10 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">Penyata &amp; Aktiviti</h2>
              <span
                title="Akan datang"
                className="cursor-not-allowed rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-medium text-zinc-400"
              >
                Download Penyata PDF (Akan Datang)
              </span>
            </div>
            {recentHistory.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-400">Belum ada pergerakan emas.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Tarikh</th>
                      <th className="py-2 pr-4 font-medium">Jenis</th>
                      <th className="py-2 pr-4 font-medium">Gram</th>
                      <th className="py-2 font-medium">Baki Selepas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentHistory.map((h) => (
                      <tr key={h.ledgerRef} className="border-t border-zinc-100">
                        <td className="py-2 pr-4 text-zinc-500">{new Date(h.timestamp).toLocaleDateString("ms-MY")}</td>
                        <td className="py-2 pr-4 text-zinc-700">{LEDGER_TYPE_LABEL[h.type] ?? h.type}</td>
                        <td className={`py-2 pr-4 font-medium ${h.direction === "IN" ? "text-emerald-700" : "text-red-700"}`}>
                          {h.direction === "IN" ? "+" : "-"}
                          {h.gram} g
                        </td>
                        <td className="py-2 text-zinc-700">{h.balanceAfter} g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Pencapaian & Ganjaran */}
          <section className="rounded-2xl border border-amber-900/10 bg-amber-900/5 p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Pencapaian &amp; Ganjaran</h2>
            {targetGram ? (
              <p className="mt-2 text-sm text-zinc-600">
                {progressPct && progressPct >= 100
                  ? "Tahniah! Anda telah mencapai sasaran simpanan anda."
                  : `Anda ${progressPct?.toFixed(0)}% menuju sasaran ${targetGram.toFixed(0)}g anda.`}
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-600">Tetapkan sasaran simpanan untuk mula jejak pencapaian anda.</p>
            )}
            <p className="mt-2 text-xs text-zinc-400">
              Cabaran simpanan dan ganjaran akan diaktifkan selepas polisi rasmi Miragold diluluskan.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
