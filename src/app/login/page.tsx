"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "login" | "signup";

// A server or platform-level error (timeout, proxy 502, etc.) can return an
// empty/HTML body instead of JSON — never let that crash the UI with
// "Unexpected end of JSON input"; fall back to a generic message instead.
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return { error: `Server ralat (${res.status}). Sila cuba lagi.` };
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/wallet";

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setStep("phone");
    setCode("");
    setError(null);
    setNeedsName(false);
  }

  async function requestOtp() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, ...(mode === "signup" ? { email } : {}) }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
        // A "Log Masuk" attempt on a number that was never registered —
        // point them at Sign Up instead of a confusing raw error.
        if (res.status === 422 && mode === "login" && message.includes("Daftar Akaun Baharu")) {
          setError(message);
          return;
        }
        throw new Error(message);
      }
      setStep("otp");
      setDevHint("Mod pembangunan: semak log server untuk kod OTP (OTP_PROVIDER=mock).");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          code,
          ...(mode === "signup" || needsName ? { name, email } : {}),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        if (res.status === 422) {
          setNeedsName(true);
          setError(
            typeof data.message === "string"
              ? data.message
              : "Nombor baharu — sila masukkan nama dan email untuk daftar.",
          );
          return;
        }
        throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      }
      router.push(nextPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup" || needsName;
  const canRequestOtp = phone.length >= 8 && (!isSignup || (name.trim().length > 0 && email.trim().length > 0));

  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-1 items-center overflow-hidden px-6 py-12">
      {/* ambient decoration */}
      <div className="glow-orb animate-float-slow -left-24 top-10 h-72 w-72 bg-amber-400/20" />
      <div className="glow-orb animate-float-slower right-0 top-1/3 h-80 w-80 bg-amber-700/10" />
      <div className="grid-mesh absolute inset-x-0 top-0 h-72" />

      <div className="relative z-10 grid w-full items-center gap-10 lg:grid-cols-2">
        {/* Branding / trust panel */}
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-900/15 bg-white/70 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-amber-800 backdrop-blur">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Gold Saving System
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-zinc-900">
            Simpan emas 916,
            <br />
            <span className="bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-600 bg-clip-text text-transparent">
              selamat &amp; telus.
            </span>
          </h1>
          <p className="mt-4 max-w-sm text-sm text-zinc-500">
            Log masuk dengan nombor telefon anda — tiada kata laluan untuk diingati. Kod OTP sekali guna dihantar
            terus kepada anda setiap kali log masuk.
          </p>

          <div className="mt-10 flex flex-col gap-4">
            <TrustRow icon="🔒" title="Sambungan disulitkan" desc="HTTPS/SSL end-to-end untuk setiap sesi." />
            <TrustRow icon="📒" title="Log audit tidak boleh diubah" desc="Setiap transaksi direkod secara kekal." />
            <TrustRow icon="💳" title="Pembayaran oleh Billplz" desc="Payment gateway berdaftar & dipercayai." />
          </div>
        </div>

        {/* Form panel */}
        <div className="mx-auto w-full max-w-sm">
          <div className="flex justify-center lg:hidden">
            <Image src="/miragold-logo.png" alt="Miragold" width={900} height={400} priority className="h-10 w-auto" />
          </div>

          <div className="relative mt-8 overflow-hidden rounded-3xl border border-amber-900/10 bg-white/80 p-8 shadow-[0_8px_40px_-12px_rgba(120,53,15,0.15)] backdrop-blur lg:mt-0">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />

            {/* Login / Sign up toggle */}
            <div className="flex rounded-full border border-zinc-200 bg-zinc-50 p-1 text-sm font-medium">
              <button
                onClick={() => switchMode("login")}
                disabled={step === "otp"}
                className={`flex-1 rounded-full py-1.5 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  mode === "login" ? "bg-amber-900 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                Log Masuk
              </button>
              <button
                onClick={() => switchMode("signup")}
                disabled={step === "otp"}
                className={`flex-1 rounded-full py-1.5 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  mode === "signup" ? "bg-amber-900 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                Daftar Akaun Baharu
              </button>
            </div>

            <h1 className="mt-5 text-2xl font-semibold text-zinc-900">
              {mode === "login" ? "Log Masuk" : "Daftar Akaun Baharu"}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {mode === "login"
                ? "Guna nombor telefon dan kod OTP."
                : "Isikan maklumat anda — kod OTP akan dihantar ke email anda."}
            </p>

            {/* step indicator */}
            <div className="mt-6 flex items-center gap-2 text-xs font-medium">
              <StepPill active={step === "phone"} done={step === "otp"} label="1" text="Maklumat" />
              <span className="h-px flex-1 bg-zinc-200" />
              <StepPill active={step === "otp"} done={false} label="2" text="Kod OTP" />
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {isSignup && step === "phone" && (
                <label className="text-sm font-medium text-zinc-700">
                  Nama penuh
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama seperti dalam IC"
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5 outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                  />
                </label>
              )}

              <label className="text-sm font-medium text-zinc-700">
                Nombor telefon
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">📱</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={step === "otp"}
                    placeholder="0123456789"
                    className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20 disabled:bg-zinc-100 disabled:text-zinc-500"
                  />
                </div>
                <span className="mt-1 block text-xs text-zinc-400">Contoh: 0123456789 — tak perlu tulis +60.</span>
              </label>

              {isSignup && step === "phone" && (
                <label className="text-sm font-medium text-zinc-700">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5 outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                  />
                  <span className="mt-1 block text-xs text-zinc-400">Kod OTP akan dihantar ke email ini.</span>
                </label>
              )}

              {step === "phone" && (
                <button
                  onClick={requestOtp}
                  disabled={busy || !canRequestOtp}
                  className="group relative mt-2 overflow-hidden rounded-full bg-gradient-to-r from-amber-800 to-amber-950 px-4 py-2.5 font-medium text-white shadow-lg shadow-amber-900/20 transition hover:from-amber-700 hover:to-amber-900 disabled:opacity-50 disabled:shadow-none"
                >
                  {!busy && <span className="shimmer-sweep" />}
                  <span className="relative">{busy ? "Menghantar..." : "Hantar OTP"}</span>
                </button>
              )}

              {step === "otp" && (
                <>
                  {devHint && (
                    <p className="rounded-lg border border-amber-900/10 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {devHint}
                    </p>
                  )}
                  <label className="text-sm font-medium text-zinc-700">
                    Kod OTP (6 digit)
                    <input
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      maxLength={6}
                      placeholder="••••••"
                      className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-center text-lg font-semibold tracking-[0.5em] outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                    />
                  </label>

                  {needsName && mode === "login" && (
                    <div className="flex flex-col gap-3 rounded-lg border border-amber-900/10 bg-amber-50/60 p-3">
                      <label className="text-sm font-medium text-zinc-700">
                        Nama penuh
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5 outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                        />
                      </label>
                      <label className="text-sm font-medium text-zinc-700">
                        Email
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5 outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                        />
                      </label>
                    </div>
                  )}

                  <button
                    onClick={verify}
                    disabled={busy || code.length !== 6 || (needsName && (!name || !email))}
                    className="group relative mt-2 overflow-hidden rounded-full bg-gradient-to-r from-amber-800 to-amber-950 px-4 py-2.5 font-medium text-white shadow-lg shadow-amber-900/20 transition hover:from-amber-700 hover:to-amber-900 disabled:opacity-50 disabled:shadow-none"
                  >
                    {!busy && <span className="shimmer-sweep" />}
                    <span className="relative">{busy ? "Mengesahkan..." : "Sahkan & Masuk"}</span>
                  </button>

                  <button
                    onClick={() => {
                      setStep("phone");
                      setCode("");
                      setError(null);
                    }}
                    className="text-center text-xs text-zinc-400 hover:text-amber-800 hover:underline"
                  >
                    Kembali
                  </button>
                </>
              )}

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400">
            <span>🔒</span> Sambungan disulitkan (SSL) — data anda selamat dengan Miragold.
          </p>
        </div>
      </div>
    </main>
  );
}

function TrustRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-900/10 bg-white text-base shadow-sm">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-zinc-800">{title}</p>
        <p className="text-xs text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}

function StepPill({ active, done, label, text }: { active: boolean; done: boolean; label: string; text: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${active ? "text-amber-900" : done ? "text-emerald-700" : "text-zinc-400"}`}>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
          active
            ? "bg-amber-900 text-white"
            : done
              ? "bg-emerald-500 text-white"
              : "border border-zinc-300 text-zinc-400"
        }`}
      >
        {done ? "✓" : label}
      </span>
      <span className="hidden sm:inline">{text}</span>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
