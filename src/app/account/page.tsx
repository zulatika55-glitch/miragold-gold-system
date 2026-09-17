"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Me = {
  customerId: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  status: string;
};

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Customer",
  STAFF: "Staff",
  SUPERVISOR: "Penyelia",
  ADMIN: "Admin",
  OWNER: "Pemilik",
};

function toLocalDisplay(phone: string): string {
  return phone.startsWith("+60") ? `0${phone.slice(3)}` : phone;
}

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) router.replace("/login?next=/account");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (me === undefined || me === null) return null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-12">
      <Link href="/wallet" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Gold Wallet
      </Link>

      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/10 text-lg font-semibold text-amber-900">
          {me.name.trim().charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Profil Saya</h1>
          <p className="text-sm text-zinc-500">Maklumat akaun Miragold anda.</p>
        </div>
      </div>

      <div className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        <Row label="Nama Penuh" value={me.name} />
        <Row label="Customer ID" value={me.customerId} mono />
        <Row label="Nombor Telefon" value={toLocalDisplay(me.phone)} />
        <Row label="Email" value={me.email ?? "—"} />
        {me.role !== "CUSTOMER" && <Row label="Peranan" value={ROLE_LABEL[me.role] ?? me.role} />}
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Nak kemaskini nama, email atau nombor telefon? Sila hubungi Miragold untuk bantuan.
      </p>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={`text-sm font-medium text-zinc-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
