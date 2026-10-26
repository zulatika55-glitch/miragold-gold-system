"use client";

import { useState } from "react";
import type { FaqItem } from "@/lib/panduan-content";

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-zinc-900 hover:bg-amber-50/50"
              aria-expanded={open}
            >
              {item.question}
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {open && <p className="px-5 pb-4 text-sm leading-relaxed text-zinc-600">{item.answer}</p>}
          </div>
        );
      })}
    </div>
  );
}
