"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { PanduanTopic } from "@/lib/panduan-content";

// Pusat Panduan Pengguna — mini-wizard per topik (sir zul: "Sebelum/Seterusnya"
// button requirement). Pure client-side step state; no data fetched, no
// wallet/Billplz/OTP touched at all — this is a read-only help page.
export default function PanduanWizard({
  topic,
  nextTopic,
}: {
  topic: PanduanTopic;
  nextTopic: { slug: string; title: string } | null;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = topic.steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === topic.steps.length - 1;

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* progress dots */}
      <div className="flex items-center justify-center gap-1.5">
        {topic.steps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === stepIndex ? "w-6 bg-amber-900" : "w-1.5 bg-zinc-200"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs font-medium text-zinc-400">
        Langkah {stepIndex + 1} daripada {topic.steps.length}
      </p>

      <div className="mt-5 overflow-hidden rounded-3xl border border-amber-900/10 bg-white shadow-[0_8px_40px_-12px_rgba(120,53,15,0.12)]">
        {step.screenshot ? (
          <div className="relative aspect-[9/16] w-full max-h-80 bg-zinc-50 sm:aspect-video sm:max-h-64">
            <Image
              src={step.screenshot}
              alt={step.title}
              fill
              sizes="(max-width: 640px) 100vw, 576px"
              className="object-contain object-top"
            />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center bg-amber-900/5 text-6xl">{topic.icon}</div>
        )}

        <div className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">{step.body}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:border-amber-900/30 hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Sebelum
        </button>

        {!isLast ? (
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.min(topic.steps.length - 1, i + 1))}
            className="rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-800"
          >
            Seterusnya →
          </button>
        ) : (
          <Link
            href="/panduan"
            className="rounded-full bg-amber-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-800"
          >
            Selesai ✓
          </Link>
        )}
      </div>

      {isLast && nextTopic && (
        <p className="mt-6 text-center text-sm text-zinc-500">
          Topik seterusnya:{" "}
          <Link href={`/panduan/${nextTopic.slug}`} className="font-medium text-amber-900 hover:underline">
            {nextTopic.title} →
          </Link>
        </p>
      )}
    </div>
  );
}
