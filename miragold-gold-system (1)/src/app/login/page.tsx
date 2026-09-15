"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/wallet";

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);

  async function requestOtp() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
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
        body: JSON.stringify({ phone, code, ...(needsName ? { name } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 422) {
          setNeedsName(true);
          setError("Nombor baharu — sila masukkan nama untuk daftar.");
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

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900">Login / Register</h1>
      <p className="mt-1 text-sm text-zinc-500">Guna nombor telefon dan kod OTP.</p>

      <div className="mt-6 flex flex-col gap-3">
        <label className="text-sm font-medium text-zinc-700">
          Nombor telefon
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={step === "otp"}
            placeholder="+60123456789"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 disabled:bg-zinc-100"
          />
        </label>

        {step === "phone" && (
          <button
            onClick={requestOtp}
            disabled={busy || phone.length < 8}
            className="mt-2 rounded-full bg-amber-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Menghantar..." : "Hantar OTP"}
          </button>
        )}

        {step === "otp" && (
          <>
            {devHint && <p className="text-xs text-amber-700">{devHint}</p>}
            <label className="text-sm font-medium text-zinc-700">
              Kod OTP (6 digit)
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>

            {needsName && (
              <label className="text-sm font-medium text-zinc-700">
                Nama penuh
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
            )}

            <button
              onClick={verify}
              disabled={busy || code.length !== 6 || (needsName && !name)}
              className="mt-2 rounded-full bg-amber-900 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {busy ? "Mengesahkan..." : "Sahkan & Masuk"}
            </button>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
