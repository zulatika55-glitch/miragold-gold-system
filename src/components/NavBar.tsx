"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Me = { customerId: string; name: string; phone: string; email: string | null; role: string } | null;

const CATALOG_URL = "https://miragold.my";

export default function NavBar() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-amber-900/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href={me ? "/wallet" : "/"} className="flex items-center gap-3">
            <Image
              src="/miragold-logo.png"
              alt="Miragold"
              width={900}
              height={400}
              priority
              className="h-8 w-auto sm:h-9"
            />
            {!loading && me && (
              <>
                <span className="hidden h-5 w-px bg-zinc-200 sm:block" />
                <span className="hidden text-sm font-medium text-zinc-500 sm:block">Gold Wallet</span>
              </>
            )}
          </Link>
          {!loading && (
            <>
              <span className="hidden h-5 w-px bg-zinc-200 sm:block" />
              <a
                href={CATALOG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden text-sm text-zinc-700 hover:text-amber-900 sm:block"
              >
                Katalog Barang Kemas
              </a>
            </>
          )}
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-5 text-sm sm:flex">
          {!loading && me && (
            <>
              {["ADMIN", "OWNER"].includes(me.role) && (
                <Link href="/admin" className="text-zinc-700 hover:text-amber-900">
                  Panel Admin
                </Link>
              )}

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-200 py-1.5 pl-3 pr-2.5 text-zinc-700 transition hover:border-amber-900/30 hover:text-amber-900"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-900/10 text-[10px] font-semibold text-amber-900">
                    {me.name.trim().charAt(0).toUpperCase()}
                  </span>
                  Akaun Saya
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-lg shadow-zinc-900/5">
                    <div className="border-b border-zinc-100 px-4 py-2.5">
                      <p className="truncate text-sm font-medium text-zinc-900">{me.name}</p>
                      <p className="text-xs text-zinc-400">{me.customerId}</p>
                    </div>
                    <Link
                      href="/account"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-zinc-700 hover:bg-amber-50 hover:text-amber-900"
                    >
                      Profil Saya
                    </Link>
                    <Link
                      href="/account/security"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-zinc-700 hover:bg-amber-50 hover:text-amber-900"
                    >
                      Keselamatan Akaun
                    </Link>
                    <button
                      onClick={logout}
                      className="block w-full border-t border-zinc-100 px-4 py-2 text-left text-sm text-zinc-500 hover:bg-amber-50 hover:text-amber-900"
                    >
                      Log Keluar
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {!loading && !me && (
            <Link href="/login" className="rounded-full bg-amber-900 px-4 py-1.5 text-white hover:bg-amber-800">
              Login / Register
            </Link>
          )}
        </nav>

        {/* Mobile menu */}
        <div className="sm:hidden" ref={mobileRef}>
          {!loading && (
            <div className="relative">
              <button
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Menu"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-700 hover:border-amber-900/30 hover:text-amber-900"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                  {mobileOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                  )}
                </svg>
              </button>

              {mobileOpen && (
                <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-lg shadow-zinc-900/5">
                  <a
                    href={CATALOG_URL}
                    onClick={() => setMobileOpen(false)}
                    className="block px-4 py-2.5 text-sm text-zinc-700 hover:bg-amber-50 hover:text-amber-900"
                  >
                    Katalog Barang Kemas
                  </a>

                  {me && (
                    <>
                      {["ADMIN", "OWNER"].includes(me.role) && (
                        <Link
                          href="/admin"
                          onClick={() => setMobileOpen(false)}
                          className="block border-t border-zinc-100 px-4 py-2.5 text-sm text-zinc-700 hover:bg-amber-50 hover:text-amber-900"
                        >
                          Panel Admin
                        </Link>
                      )}
                      <div className="border-t border-zinc-100 px-4 py-2.5">
                        <p className="truncate text-sm font-medium text-zinc-900">{me.name}</p>
                        <p className="text-xs text-zinc-400">{me.customerId}</p>
                      </div>
                      <Link
                        href="/account"
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-2.5 text-sm text-zinc-700 hover:bg-amber-50 hover:text-amber-900"
                      >
                        Profil Saya
                      </Link>
                      <Link
                        href="/account/security"
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-2.5 text-sm text-zinc-700 hover:bg-amber-50 hover:text-amber-900"
                      >
                        Keselamatan Akaun
                      </Link>
                      <button
                        onClick={logout}
                        className="block w-full border-t border-zinc-100 px-4 py-2.5 text-left text-sm text-zinc-500 hover:bg-amber-50 hover:text-amber-900"
                      >
                        Log Keluar
                      </button>
                    </>
                  )}

                  {!me && (
                    <Link
                      href="/login"
                      onClick={() => setMobileOpen(false)}
                      className="block border-t border-zinc-100 px-4 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-50"
                    >
                      Login / Register
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
