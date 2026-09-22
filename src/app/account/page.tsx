"use client";

import { useEffect, useState, type ReactNode } from "react";
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

type BankInfo = {
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolderName: string | null;
  bankDetailsUpdatedAt: string | null;
  nameMatches: boolean;
};

function maskAccountNumber(num: string): string {
  const digits = num.replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

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

// Same verified check used in the NavBar's "Akaun Saya" menu (sir zul, 19/9).
function VerifiedBadge() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Akaun disahkan">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
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
        <Row
          label="Customer ID"
          value={
            <span className="inline-flex items-center gap-1">
              {me.customerId}
              {me.status === "ACTIVE" && <VerifiedBadge />}
            </span>
          }
          mono
        />
        <Row label="Nombor Telefon" value={toLocalDisplay(me.phone)} />
        <Row label="Email" value={me.email ?? "—"} />
        {me.role !== "CUSTOMER" && <Row label="Peranan" value={ROLE_LABEL[me.role] ?? me.role} />}
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Nak kemaskini nama, email atau nombor telefon? Sila hubungi Miragold untuk bantuan.
      </p>

      <BankAccountSection />
    </main>
  );
}

// Fasa 2A spec section 9 — customer must have bank details on file to
// receive a Jual Emas payout, and changing them needs OTP verification.
// Shown on the profile page (not the sell flow itself) so a customer can
// fix a mismatch before they ever reach "Jual Emas".
function BankAccountSection() {
  const [bank, setBank] = useState<BankInfo | undefined>(undefined);
  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ bankName: "", bankAccountNumber: "", bankAccountHolderName: "", otpCode: "" });

  useEffect(() => {
    // Deliberately not calling load() here (its first statement sets state
    // synchronously) — inline the fetch instead, matching the pattern used
    // by the other admin pages.
    fetch("/api/account/bank")
      .then((r) => r.json())
      .then((d) => setBank(d.bank));
  }, []);

  function startEdit() {
    setError(null);
    setSuccess(null);
    setOtpSent(false);
    setForm({
      bankName: bank?.bankName ?? "",
      bankAccountNumber: bank?.bankAccountNumber ?? "",
      bankAccountHolderName: bank?.bankAccountHolderName ?? "",
      otpCode: "",
    });
    setEditing(true);
  }

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REQUEST_OTP" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal menghantar OTP");
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitUpdate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal mengemaskini maklumat bank");
      setBank(data.bank);
      setEditing(false);
      setSuccess("Maklumat bank berjaya dikemaskini.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (bank === undefined) return null;

  return (
    <div className="mt-8">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Akaun Bank (untuk Jual Emas)</p>

      {!editing ? (
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white">
          {!bank.bankAccountNumber ? (
            <div className="p-5 text-sm text-zinc-500">
              Belum ada maklumat bank direkodkan. Tambah maklumat bank untuk boleh guna Jual Emas.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              <Row label="Bank" value={bank.bankName ?? "—"} />
              <Row
                label="No. Akaun"
                value={
                  <button onClick={() => setReveal((v) => !v)} className="font-mono text-xs text-zinc-900 hover:text-amber-900">
                    {reveal ? bank.bankAccountNumber : maskAccountNumber(bank.bankAccountNumber)}
                  </button>
                }
              />
              <Row label="Nama Pemegang Akaun" value={bank.bankAccountHolderName ?? "—"} />
            </div>
          )}
          {bank.bankAccountNumber && !bank.nameMatches && (
            <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
              ⚠️ Nama pemegang akaun bank tidak sepadan dengan nama Gold Wallet anda. Anda perlu betulkan dahulu
              sebelum boleh guna Jual Emas secara self-service, atau hubungi Miragold untuk verification manual.
            </div>
          )}
          <div className="border-t border-zinc-100 p-4">
            <button
              onClick={startEdit}
              className="rounded-full border border-amber-900/20 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
            >
              {bank.bankAccountNumber ? "Kemaskini Maklumat Bank" : "Tambah Maklumat Bank"}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submitUpdate} className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-amber-900/10 bg-white p-5">
          <label className="text-sm font-medium text-zinc-700">
            Nama Bank
            <input
              required
              value={form.bankName}
              onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
              placeholder="Cth: Maybank"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Nombor Akaun
            <input
              required
              value={form.bankAccountNumber}
              onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Nama Pemegang Akaun
            <input
              required
              value={form.bankAccountHolderName}
              onChange={(e) => setForm((f) => ({ ...f, bankAccountHolderName: e.target.value }))}
              placeholder="Perlu sama dengan nama Gold Wallet anda"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>

          {!otpSent ? (
            <button
              type="button"
              onClick={sendOtp}
              disabled={busy}
              className="mt-1 w-fit rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Menghantar..." : "Hantar Kod OTP"}
            </button>
          ) : (
            <label className="text-sm font-medium text-zinc-700">
              Kod OTP (dihantar untuk sahkan perubahan)
              <input
                required
                inputMode="numeric"
                maxLength={6}
                value={form.otpCode}
                onChange={(e) => setForm((f) => ({ ...f, otpCode: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 tracking-widest"
              />
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-1 flex gap-2">
            {otpSent && (
              <button
                disabled={busy}
                className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Menyimpan..." : "Sahkan & Simpan"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {success && <p className="mt-2 text-sm text-emerald-700">{success}</p>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={`text-sm font-medium text-zinc-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
