import Link from "next/link";
import { PANDUAN_TOPICS, PANDUAN_FAQ } from "@/lib/panduan-content";
import FaqAccordion from "@/components/FaqAccordion";

// Read directly rather than importing from src/app/api/orders/route.ts (which
// doesn't export it, and Module 03 is explicitly "DO NOT TOUCH" territory —
// this panduan feature never modifies or even imports from it) — same env
// var, same default ("10"), kept in sync by reading the one source of truth.
const PRICE_LOCK_MINUTES_LABEL = `${process.env.PRICE_LOCK_MINUTES ?? "10"} minit`;

// Pusat Panduan Pengguna — hub page. Public (no login needed), reachable
// before AND after login (sir zul's requirement #1) — linked from NavBar
// next to "Katalog Barang Kemas", not buried inside the member-only "Akaun
// Saya" dropdown.
export const metadata = {
  title: "Panduan Pengguna — Miragold Gold Wallet",
  description: "Belajar guna Gold Wallet Miragold langkah demi langkah — daftar akaun, beli emas, tebusan dan lagi.",
};

export default function PanduanHubPage() {
  const whatsappNumber = process.env.SUPPORT_WHATSAPP_NUMBER;
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(
        "Hai Miragold, saya ada soalan pasal Gold Wallet.",
      )}`
    : null;

  // FAQ answers that quote a timing window are built here (not hard-coded
  // in panduan-content.ts) so they stay correct automatically if sir zul
  // ever changes these env vars.
  const faqWithDynamicAnswers = PANDUAN_FAQ.map((item) =>
    item.question.startsWith("Macam mana harga emas")
      ? {
          ...item,
          answer: `${item.answer} Harga yang anda kunci semasa membeli (price lock) kekal sah selama lebih kurang ${PRICE_LOCK_MINUTES_LABEL} sahaja — bayar sebelum tamat tempoh untuk kekalkan harga tersebut.`,
        }
      : item,
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-900/15 bg-amber-900/5 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-amber-800">
          Pusat Panduan Pengguna
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          Cara guna Gold Wallet Miragold
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-500">
          Panduan ringkas langkah demi langkah — tiada perlu tanya staff untuk mula simpan emas 916 anda.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PANDUAN_TOPICS.map((topic) => (
          <Link
            key={topic.slug}
            href={`/panduan/${topic.slug}`}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-900/30 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-900/10 text-xl">
              {topic.icon}
            </span>
            <h2 className="mt-3 text-sm font-semibold text-zinc-900 group-hover:text-amber-900">{topic.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{topic.shortDesc}</p>
            <span className="mt-3 inline-flex items-center text-xs font-medium text-amber-900">
              Mula &rarr;
            </span>
          </Link>
        ))}
      </div>

      <section id="faq" className="mt-16 scroll-mt-24">
        <h2 className="text-xl font-semibold text-zinc-900">Soalan Lazim (FAQ)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Tak jumpa jawapan? Hubungi team Miragold terus di bawah.
        </p>
        <div className="mt-5">
          <FaqAccordion items={faqWithDynamicAnswers} />
        </div>
      </section>

      <section className="mt-12 rounded-3xl border border-amber-900/10 bg-gradient-to-br from-amber-900/5 to-amber-900/0 p-8 text-center">
        <h2 className="text-lg font-semibold text-zinc-900">Masih perlukan bantuan?</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
          Team Miragold sedia membantu untuk sebarang soalan tentang Gold Wallet anda.
        </p>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
          >
            💬 Hubungi Team Miragold (WhatsApp)
          </a>
        ) : (
          <p className="mt-5 text-xs text-zinc-400">Saluran WhatsApp sokongan akan tersedia tidak lama lagi.</p>
        )}
      </section>
    </main>
  );
}
