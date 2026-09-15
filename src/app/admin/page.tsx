"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-widest text-amber-800">Panel Admin</p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Selamat datang, {me?.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">Gambaran keseluruhan sistem Gold Saving Miragold.</p>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Jumlah Customer" value={stats?.totalCustomers ?? "—"} />
        <StatCard label="Staff / Admin" value={stats?.totalStaff ?? "—"} />
        <StatCard label="Gram Beredar" value={stats ? `${stats.totalGramInCirculation} g` : "—"} />
        <StatCard label="Order Hari Ini" value={stats?.ordersToday ?? "—"} />
        <StatCard
          label="Menunggu Semakan"
          value={stats?.pendingAllocations ?? "—"}
          warn={!!stats && stats.pendingAllocations > 0}
        />
        <StatCard
          label="Harga Semasa"
          value={stats?.currentPrice ? `RM${stats.currentPrice.sellPrice916}` : "—"}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AdminCard
          href="/admin/price"
          title="Urus Harga Emas"
          description="Kemaskini harga jual & beli balik 916 harian, tengok sejarah perubahan harga."
        />
        <AdminCard
          href="/admin/staff"
          title="Urus Staff / Pilot"
          description="Tambah akaun staff, tag akaun sedia ada, tukar peranan atau status."
        />
      </div>
    </main>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-red-200 bg-red-50" : "border-amber-900/10 bg-white"}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${warn ? "text-red-700" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
}

function AdminCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-amber-900/10 bg-white p-6 transition hover:border-amber-900/30 hover:shadow-sm"
    >
      <h2 className="text-lg font-medium text-zinc-900">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
      <span className="mt-3 inline-block text-sm font-medium text-amber-900">Buka →</span>
    </Link>
  );
}
