"use client";

import { useEffect, useState } from "react";
import type { CollectionArchetype, CustomerJudgment, CustomerSummary } from "@/lib/types";
import { fmtUSD } from "@/lib/analytics";

const ARCHETYPE_LABEL: Record<CollectionArchetype, string> = {
  reliable: "Reliable",
  gentle_nudge: "Gentle nudge",
  needs_escalation: "Needs escalation",
  at_risk: "At risk",
  insufficient_data: "Insufficient data",
};

const PILL_CLASSES: Record<CollectionArchetype, string> = {
  reliable: "bg-signal-good/10 text-signal-good",
  gentle_nudge: "bg-ink-100 text-ink-700",
  needs_escalation: "bg-signal-warn/15 text-[#8a6f3a]",
  at_risk: "bg-signal-risk/15 text-signal-risk",
  insufficient_data: "bg-ink-100 text-ink-500 italic",
};

export default function TouchDrawer({
  open,
  onClose,
  summary,
  judgment,
}: {
  open: boolean;
  onClose: () => void;
  summary: CustomerSummary | null;
  judgment: CustomerJudgment | null;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    if (!judgment?.suggested_touch) return;
    const t = judgment.suggested_touch;
    await navigator.clipboard.writeText(`Subject: ${t.subject}\n\n${t.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink-950/15 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col border-l border-rule bg-paper shadow-[-24px_0_48px_-24px_rgba(10,10,9,0.18)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {summary && judgment ? (
          <div className="flex h-full flex-col overflow-y-auto">
            <div className="flex items-start justify-between border-b border-rule px-7 pb-6 pt-7">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
                  Customer
                </div>
                <h2 className="mt-1 font-serif text-[32px] leading-tight text-ink-950">
                  {summary.customer}
                </h2>
                <div className="mt-3">
                  <span
                    className={`inline-flex items-center rounded-sm px-2 py-[3px] text-[11px] font-medium tracking-tight ${PILL_CLASSES[judgment.archetype]}`}
                  >
                    {ARCHETYPE_LABEL[judgment.archetype]}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500 hover:text-ink-900"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-y-3 border-b border-rule px-7 py-5 font-mono text-[12px]">
              <div className="text-ink-400">Open balance</div>
              <div className="text-right tabular text-ink-900">
                {fmtUSD(summary.open_balance_cents)}
              </div>
              <div className="text-ink-400">Avg days late</div>
              <div className="text-right tabular text-ink-900">
                {summary.avg_days_late}
              </div>
              <div className="text-ink-400">Oldest open</div>
              <div className="text-right tabular text-ink-900">
                {summary.oldest_open_days}d
              </div>
              <div className="text-ink-400">Paid history</div>
              <div className="text-right tabular text-ink-900">
                {summary.paid_count}/{summary.invoice_count}
              </div>
              <div className="text-ink-400">Confidence</div>
              <div className="text-right tabular text-ink-900">
                {judgment.confidence.toFixed(2)}
                {judgment.needs_human_review && (
                  <span
                    className="ml-2 cursor-help font-serif text-signal-risk"
                    title="Flagged for human review"
                  >
                    †
                  </span>
                )}
              </div>
            </div>

            <div className="border-b border-rule px-7 py-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                Reasoning
              </div>
              <p className="mt-2 font-serif text-[15px] leading-relaxed text-ink-800">
                {judgment.reasoning}
              </p>
            </div>

            <div className="border-b border-rule px-7 py-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                Recommended action
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-800">
                {judgment.recommended_action}
              </p>
            </div>

            {judgment.suggested_touch && (
              <div className="px-7 py-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                    Drafted first touch
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500 hover:text-ink-900"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="border border-rule bg-ink-50/40 p-5">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                    Subject
                  </div>
                  <div className="mt-1 text-[14px] font-medium text-ink-900">
                    {judgment.suggested_touch.subject}
                  </div>
                  <div className="my-4 h-px bg-rule" />
                  <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink-800">
                    {judgment.suggested_touch.body}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </aside>
    </>
  );
}
