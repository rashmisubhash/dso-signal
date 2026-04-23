import type { AnalysisResult, CollectionArchetype } from "@/lib/types";
import { fmtUSD } from "@/lib/analytics";

const ARCHETYPE_FILL: Record<CollectionArchetype, string> = {
  at_risk: "#a86155",
  needs_escalation: "#c9a96a",
  gentle_nudge: "#33312d",
  reliable: "#6b8e6f",
  insufficient_data: "#a8a499",
};

const LEGEND: Array<{ key: CollectionArchetype; label: string }> = [
  { key: "at_risk", label: "At risk" },
  { key: "needs_escalation", label: "Needs escalation" },
  { key: "gentle_nudge", label: "Gentle nudge" },
  { key: "reliable", label: "Reliable" },
  { key: "insufficient_data", label: "Insufficient data" },
];

export default function ExposureBars({ result }: { result: AnalysisResult }) {
  const total = result.customers.reduce((s, c) => s + c.open_balance_cents, 0);
  const judgmentByName = new Map(result.judgments.map((j) => [j.customer, j]));

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-[24px] leading-tight text-ink-950">
          Where your {fmtUSD(total)} outstanding actually lives
        </h2>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
          By customer &middot; colored by behavior
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {result.customers.map((c) => {
          const j = judgmentByName.get(c.customer);
          const fill = j ? ARCHETYPE_FILL[j.archetype] : ARCHETYPE_FILL.insufficient_data;
          const shareOfTotal = total > 0 ? c.open_balance_cents / total : 0;
          const widthPct = shareOfTotal * 100;
          const labelInside = shareOfTotal > 0.15;
          const amount = fmtUSD(c.open_balance_cents);

          return (
            <div
              key={c.customer}
              className="flex items-center gap-3 sm:gap-4"
            >
              <div className="w-[110px] shrink-0 truncate text-right text-[12px] text-ink-700 sm:w-[180px] sm:text-[13px]">
                {c.customer}
              </div>
              <div className="relative h-7 flex-1 bg-rule">
                <div
                  className="absolute inset-y-0 left-0 flex items-center justify-end"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: fill,
                  }}
                >
                  {labelInside && (
                    <span className="pr-2 font-mono tabular text-[11px] text-paper">
                      {amount}
                    </span>
                  )}
                </div>
                {!labelInside && (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 pl-2 font-mono tabular text-[11px] text-ink-600"
                    style={{ left: `${widthPct}%` }}
                  >
                    {amount}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-16 mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
        {LEGEND.map((item, i) => (
          <span key={item.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2"
              style={{ backgroundColor: ARCHETYPE_FILL[item.key] }}
            />
            {item.label}
            {i < LEGEND.length - 1 && (
              <span className="ml-3 text-ink-200" aria-hidden>
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}
