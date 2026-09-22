"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BUYBACK_PAYOUT_TIMEFRAME_LABEL } from "@/lib/buyback";

type WalletData = { balanceGram: string };
type PriceInfo = { buybackPrice916: string };
type BankInfo = {
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolderName: string | null;
  nameMatches: boolean;
};

type CreatedRequest = {
  requestRef: string;
  gram: string;
  buybackPriceSnapshot: string;
  payoutAmountRm: string;
  otpExpiresAt: string;
};

function maskAccountNumber(num: string): string {
  const digits = num.replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

type Step = "loading" | "blocked" | "input" | "preview" | "otp" | "success";

export default function JualEmasPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const [available, setAvailable] = useState<string>("0");
  const [buybackPrice, setBuybackPrice] = useState<string>("0");
  const [bank, setBank] = useState<BankInfo | null>(null);

  const [mode, setMode] = useState<"AMOUNT" | "ALL">("AMOUNT");
  const [gramInput, setGramInput] = useState("");
  const [bankConfirmed, setBankConfirmed] = useState(false);

  const [created, setCreated] = useState<CreatedRequest | null>(null);
  const [otpCode, setOtpCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [walletRes, priceRes, bankRes] = await Promise.all([
        fetch("/api/wallet"),
        fetch("/api/price"),
        fetch("/api/account/bank"),
      ]);
      if (cancelled) return;
      if (walletRes.status === 401) {
        router.replace("/login?next=/wallet/jual-emas");
        return;
      }
      if (!walletRes.ok || !priceRes.ok || !bankRes.ok) {
        setError("Gagal memuatkan maklumat wallet");
        return;
      }
      const walletData: WalletData = await walletRes.json();
      const priceData: PriceInfo = await priceRes.json();
      const bankData: { bank: BankInfo } = await bankRes.json();

      setAvailable(walletData.balanceGram);
      setBuybackPrice(priceData.buybackPrice916);
      setBank(bankData.bank);

      if (!bankData.bank.bankAccountNumber) {
        setBlockedReason("Anda belum ada maklumat akaun bank. Sila tambah dahulu di Profil Saya.");
        setStep("blocked");
      } else if (!bankData.bank.nameMatches) {
        setBlockedReason(
          "Nama pemegang akaun bank anda tidak sepadan dengan nama Gold Wallet. Sila hubungi Miragold untuk verification/manual review.",
        );
        setStep("blocked");
      } else if (Number(walletData.balanceGram) <= 0) {
        setBlockedReason("Baki emas tersedia anda adalah 0.0000g. Tiada emas untuk dijual.");
        setStep("blocked");
      } else {
        setStep("input");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const gramToSell = mode === "ALL" ? available : gramInput || "0";
  const payoutPreview = (Number(gramToSell) * Number(buybackPrice)).toFixed(2);
  const balanceAfter = (Number(available) - Number(gramToSell)).toFixed(4);

  function goToPreview() {
    setError(null);
    const g = Number(gramToSell);
    if (!g || g <= 0) {
      setError("Sila masukkan jumlah gram yang sah");
      return;
    }
    if (g > Number(available)) {
      setError(`Jumlah melebihi baki tersedia (${available}g)`);
      return;
    }
    setStep("preview");
  }

  async function submitSale() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/buyback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "ALL"
            ? { sellAll: true, confirmBankDetails: true }
            : { gram: Number(gramInput), confirmBankDetails: true },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal menghantar permohonan");
      setCreated(data.request);
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp() {
    if (!created) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallet/buyback/${created.requestRef}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kod OTP tidak sah");
      setStep("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-12">
      <Link href="/wallet" className="inline-flex items-center gap-1 text-sm text-amber-900 hover:underline">
        ← Gold Wallet
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Jual Emas</h1>

      {step === "loading" && <p className="mt-6 text-zinc-400">Memuatkan...</p>}

      {step === "blocked" && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <p>{blockedReason}</p>
          <Link href="/account" className="mt-4 inline-block rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white">
            Kemaskini Profil Saya
          </Link>
        </div>
      )}

      {step === "input" && (
        <div className="mt-6 rounded-2xl border border-amber-900/10 bg-white p-6">
          <p className="text-sm text-zinc-500">Baki tersedia</p>
          <p className="text-2xl font-bold text-amber-900">{available} g</p>
          <p className="mt-1 text-xs text-zinc-400">Harga Beli Balik 916 semasa: RM{buybackPrice}/g</p>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setMode("AMOUNT")}
              className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium ${mode === "AMOUNT" ? "border-amber-900 bg-amber-900 text-white" : "border-zinc-300 text-zinc-700"}`}
            >
              Masukkan Jumlah Gram
            </button>
            <button
              onClick={() => setMode("ALL")}
              className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium ${mode === "ALL" ? "border-amber-900 bg-amber-900 text-white" : "border-zinc-300 text-zinc-700"}`}
            >
              Jual Semua
            </button>
          </div>

          {mode === "AMOUNT" && (
            <label className="mt-4 block text-sm font-medium text-zinc-700">
              Gram
              <input
                type="number"
                step="0.0001"
                min="0"
                max={available}
                value={gramInput}
                onChange={(e) => setGramInput(e.target.value)}
                placeholder="0.0000"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
          )}

          {Number(gramToSell) > 0 && (
            <div className="mt-4 rounded-xl bg-amber-50/60 p-4 text-sm text-zinc-700">
              Anggaran akan diterima: <span className="font-semibold text-amber-900">RM{payoutPreview}</span>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            onClick={goToPreview}
            className="mt-5 w-full rounded-full bg-amber-900 px-4 py-2.5 font-medium text-white hover:bg-amber-800"
          >
            Seterusnya
          </button>
        </div>
      )}

      {step === "preview" && bank && (
        <div className="mt-6 rounded-2xl border border-amber-900/10 bg-white p-6">
          <h2 className="text-lg font-medium text-zinc-900">Sahkan Jualan</h2>
          <div className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
            <Row label="Gram Dijual" value={`${Number(gramToSell).toFixed(4)} g`} />
            <Row label="Harga Beli Balik" value={`RM${buybackPrice}/g`} />
            <Row label="Jumlah Akan Diterima" value={`RM${payoutPreview}`} bold />
            <Row label="Baki Selepas Jual" value={`${balanceAfter} g`} />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            Payout akan diproses dalam {BUYBACK_PAYOUT_TIMEFRAME_LABEL} melalui pindahan bank.
          </p>

          <h3 className="mt-5 text-sm font-medium text-zinc-900">Maklumat Akaun Bank</h3>
          <div className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-100 text-sm">
            <Row label="Bank" value={bank.bankName ?? "—"} />
            <Row label="No. Akaun" value={bank.bankAccountNumber ? maskAccountNumber(bank.bankAccountNumber) : "—"} />
            <Row label="Nama Pemegang Akaun" value={bank.bankAccountHolderName ?? "—"} />
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={bankConfirmed}
              onChange={(e) => setBankConfirmed(e.target.checked)}
              className="mt-1"
            />
            Saya mengesahkan maklumat akaun bank ini adalah betul.
          </label>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button
              onClick={submitSale}
              disabled={!bankConfirmed || busy}
              className="flex-1 rounded-full bg-amber-900 px-4 py-2.5 font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {busy ? "Menghantar..." : "SAHKAN JUALAN"}
            </button>
            <button
              onClick={() => setStep("input")}
              className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-400"
            >
              Kembali
            </button>
          </div>
        </div>
      )}

      {step === "otp" && created && (
        <div className="mt-6 rounded-2xl border border-amber-900/10 bg-white p-6">
          <h2 className="text-lg font-medium text-zinc-900">Sahkan dengan OTP</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Kod OTP telah dihantar. Sila masukkan untuk mengesahkan jualan {created.gram}g bernilai RM{created.payoutAmountRm}.
          </p>
          <label className="mt-4 block text-sm font-medium text-zinc-700">
            Kod OTP
            <input
              required
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 tracking-widest"
            />
          </label>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button
            onClick={submitOtp}
            disabled={busy || otpCode.length !== 6}
            className="mt-4 w-full rounded-full bg-amber-900 px-4 py-2.5 font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {busy ? "Mengesahkan..." : "Sahkan"}
          </button>
        </div>
      )}

      {step === "success" && created && (
        <div className="relative mt-6 overflow-hidden rounded-3xl border border-emerald-900/10 bg-white p-8 text-center shadow-[0_8px_40px_-12px_rgba(6,95,70,0.2)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
          <h2 className="mt-4 text-xl font-semibold text-zinc-900">Permohonan Jual Balik Berjaya Dihantar</h2>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">RM{created.payoutAmountRm}</p>
          <div className="mx-auto mt-6 max-w-sm divide-y divide-zinc-100 rounded-2xl border border-zinc-100 bg-zinc-50 text-sm">
            <Row label="Gram Dijual" value={`${created.gram} g`} />
            <Row label="Harga Dikunci" value={`RM${created.buybackPriceSnapshot}/g`} />
            <Row label="Transaction ID" value={created.requestRef} mono />
            <Row label="Status" value="Diterima, Menunggu Semakan" />
          </div>
          <p className="mt-5 text-sm text-emerald-700">Payout dijangka dalam {BUYBACK_PAYOUT_TIMEFRAME_LABEL}.</p>
          <Link href="/wallet" className="mt-6 inline-block rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white">
            Kembali ke Gold Wallet
          </Link>
        </div>
      )}
    </main>
  );
}

function Row({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-zinc-500">{label}</span>
      <span className={`${bold ? "text-base font-bold text-amber-900" : "font-semibold text-zinc-800"} ${mono ? "font-mono text-xs" : ""} tabular-nums`}>
        {value}
      </span>
    </div>
  );
}
