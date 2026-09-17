"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Me = { customerId: string; name: string; phone: string; email: string | null; role: string } | null;

export default function AccountSecurityPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (!d.user) router.replace("/login?next=/account/security");
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
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/10 text-lg">🔒</span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Keselamatan Akaun</h1>
          <p className="text-sm text-zinc-500">Bagaimana akaun Miragold anda dilindungi.</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg">✅</span>
          <div>
            <p className="text-sm font-medium text-zinc-900">Log masuk tanpa kata laluan</p>
            <p className="mt-1 text-sm text-zinc-500">
              Akaun anda menggunakan kod OTP sekali guna yang dihantar ke email{" "}
              <span className="font-medium text-zinc-700">{me.email ?? "berdaftar"}</span> setiap kali log masuk —
              tiada kata laluan untuk diingati atau dicuri.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 border-t border-zinc-100 pt-5">
          <span className="mt-0.5 text-lg">🔐</span>
          <div>
            <p className="text-sm font-medium text-zinc-900">Sambungan disulitkan</p>
            <p className="mt-1 text-sm text-zinc-500">
              Semua data dihantar melalui sambungan HTTPS/SSL yang disulitkan hujung ke hujung.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 border-t border-zinc-100 pt-5">
          <span className="mt-0.5 text-lg">📒</span>
          <div>
            <p className="text-sm font-medium text-zinc-900">Setiap transaksi direkod</p>
            <p className="mt-1 text-sm text-zinc-500">
              Setiap pembelian dan pergerakan gram dalam Gold Wallet anda direkod secara kekal dan tidak boleh diubah.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Perasan aktiviti mencurigakan pada akaun anda? Sila hubungi Miragold dengan segera.
      </p>
    </main>
  );
}
