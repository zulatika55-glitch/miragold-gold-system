"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatWithThousands } from "@/lib/decimal";

type Stats = {
  totalCustomers: number;
  totalStaff: number;
  totalGramInCirculation: string;
  pendingAllocations: number;
  ordersToday: number;
  currentPrice: { sellPrice916: string; buybackPrice916: string } | null;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string; name: string } | null | undefined>(undefined);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) {
          router.replace("/login?next=/admin");
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
      const res = await fetch("/api/admin/stats");
      if (cancelled) return;
      if (!res.ok) {
        setError("Gagal memuatkan statistik");
        return;
      }
      setStats(await res.json());
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [me]);

  if (me === undefined) return null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <div className="flex flex-col gap-4 border-b border-amber-900/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-amber-800">Panel Admin</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900 sm:text-3xl">Selamat datang, {me?.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">Gambaran keseluruhan sistem Gold Saving Miragold.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-amber-900/10 bg-white px-4 py-2 text-xs text-zinc-500 sm:self-auto">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Sistem beroperasi normal
        </div>
      </div>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      <div className="mt-8 rounded-2xl border border-amber-900/15 bg-gradient-to-br from-amber-50 to-white p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-amber-800">Total Gold Wallet Liability</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-900 sm:text-4xl">
          {stats ? formatWithThousands(stats.totalGramInCirculation) : "—"} g
        </p>
        <p className="mt-2 max-w-xl text-sm text-zinc-500">
          Jumlah gram emas semua customer digabungkan (baki wallet setiap customer dijumlahkan) — ini jumlah gram
          emas yang Miragold berhutang kepada semua pemegang Gold Wallet.
        </p>
      </div>

      <p className="mt-8 text-xs font-medium uppercase tracking-widest text-zinc-400">Ringkasan</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon="👥" label="Jumlah Customer" value={stats?.totalCustomers ?? "—"} />
        <StatCard icon="🧑‍💼" label="Staff / Admin" value={stats?.totalStaff ?? "—"} />
        <StatCard icon="🧾" label="Order Hari Ini" value={stats?.ordersToday ?? "—"} />
        <StatCard
          icon="⏳"
          label="Menunggu Semakan"
          value={stats?.pendingAllocations ?? "—"}
          warn={!!stats && stats.pendingAllocations > 0}
        />
        <StatCard
          icon="💰"
          label="Harga Semasa (jual)"
          value={stats?.currentPrice ? `RM${stats.currentPrice.sellPrice916}` : "—"}
          accent
        />
      </div>

      <p className="mt-10 text-xs font-medium uppercase tracking-widest text-zinc-400">Aksi Pantas</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AdminCard
          href="/admin/price"
          icon="💰"
          title="Urus Harga Emas"
          description="Kemaskini harga jual & beli balik 916 harian, tengok sejarah perubahan harga."
        />
        <AdminCard
          href="/admin/staff"
          icon="🧑‍💼"
          title="Urus Staff / Pilot"
          description="Tambah akaun staff, tag akaun sedia ada, tukar peranan atau status."
        />
        <AdminCard
          href="/admin/orders"
          icon="🧾"
          title="Semua Transaksi"
          description="Semak setiap transaksi customer: RM, harga lock, gram, rujukan Billplz, status bayaran & wallet."
        />
        <AdminCard
          href="/admin/adjustments"
          icon="⚖️"
          title="Adjustment Wallet"
          description="Betulkan baki gram customer secara terkawal — mandatori sebab & direkod dalam audit trail."
        />
      </div>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  warn,
  accent,
}: {
  icon: string;
  label: string;
  value: string | number;
  warn?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition hover:shadow-sm ${
        warn
          ? "border-red-200 bg-red-50"
          : accent
            ? "border-amber-900/20 bg-amber-900/5"
            : "border-amber-900/10 bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{icon}</span>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
      <p className={`mt-2 text-xl font-semibold ${warn ? "text-red-700" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
}

function AdminCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-amber-900/10 bg-white p-6 transition hover:border-amber-900/30 hover:shadow-md"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/10 text-lg">
        {icon}
      </span>
      <h2 className="mt-4 text-lg font-medium text-zinc-900">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-900">
        Buka
        <span className="transition group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}
