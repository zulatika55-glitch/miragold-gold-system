"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Me = { customerId: string; name: string; phone: string; role: string } | null;

export default function NavBar() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-amber-900/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/miragold-logo.png"
            alt="Miragold"
            width={900}
            height={400}
            priority
            className="h-8 w-auto sm:h-9"
          />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {!loading && me && (
            <>
              <Link href="/wallet" className="text-zinc-700 hover:text-amber-900">
                Gold Wallet
              </Link>
              {["ADMIN", "OWNER"].includes(me.role) && (
                <Link href="/admin" className="text-zinc-700 hover:text-amber-900">
                  Panel Admin
                </Link>
              )}
              <span className="hidden text-zinc-400 sm:inline">{me.name}</span>
              <button onClick={logout} className="text-zinc-500 hover:text-amber-900">
                Log out
              </button>
            </>
          )}
          {!loading && !me && (
            <Link href="/login" className="rounded-full bg-amber-900 px-4 py-1.5 text-white hover:bg-amber-800">
              Login / Register
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
