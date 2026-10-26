import Link from "next/link";
import { notFound } from "next/navigation";
import { PANDUAN_TOPICS } from "@/lib/panduan-content";
import PanduanWizard from "@/components/PanduanWizard";

export function generateStaticParams() {
  return PANDUAN_TOPICS.map((t) => ({ topik: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ topik: string }> }) {
  const { topik } = await params;
  const topic = PANDUAN_TOPICS.find((t) => t.slug === topik);
  return { title: topic ? `${topic.title} — Panduan Miragold` : "Panduan Miragold" };
}

export default async function PanduanTopicPage({ params }: { params: Promise<{ topik: string }> }) {
  const { topik } = await params;
  const index = PANDUAN_TOPICS.findIndex((t) => t.slug === topik);
  if (index === -1) notFound();

  const topic = PANDUAN_TOPICS[index];
  const next = PANDUAN_TOPICS[index + 1];
  const nextTopic = next ? { slug: next.slug, title: next.title } : null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <Link href="/panduan" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-amber-900">
        ← Kembali ke Panduan Pengguna
      </Link>

      <div className="mt-4 text-center">
        <span className="text-3xl">{topic.icon}</span>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{topic.title}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">{topic.shortDesc}</p>
      </div>

      <div className="mt-8">
        <PanduanWizard topic={topic} nextTopic={nextTopic} />
      </div>
    </main>
  );
}
