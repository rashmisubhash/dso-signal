import type { CollectionArchetype, CustomerJudgment, CustomerSummary } from "@/lib/types";
import { fmtUSD } from "@/lib/analytics";

const ARCHETYPE_LABEL: Record<CollectionArchetype, string> = {
  reliable: "Reliable",
  gentle_nudge: "Gentle nudge",
  needs_escalation: "Needs escalation",
  at_risk: "At risk",
  insufficient_data: "Insufficient data",
};

function ArchetypePill({ archetype }: { archetype: CollectionArchetype }) {
  const classes: Record<CollectionArchetype, string> = {
    reliable: "bg-signal-good/10 text-signal-good",
    gentle_nudge: "bg-ink-100 text-ink-700",
    needs_escalation: "bg-signal-warn/15 text-[#8a6f3a]",
    at_risk: "bg-signal-risk/15 text-signal-risk",
    insufficient_data: "bg-ink-100 text-ink-500 italic",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-[3px] text-[11px] font-medium tracking-tight ${classes[archetype]}`}
    >
      {ARCHETYPE_LABEL[archetype]}
    </span>
  );
}

function ConfidenceBar({
  value,
  flagged,
}: {
  value: number;
  flagged: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-[6px] w-20 overflow-hidden rounded-sm bg-rule">
        <div
          className="h-full bg-ink-950"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono tabular text-[11px] text-ink-600">
        {value.toFixed(2)}
      </span>
      {flagged && (
        <span
          className="cursor-help font-serif text-[13px] text-signal-risk"
          title="Flagged for human review"
        >
          †
        </span>
      )}
    </div>
  );
}

export default function CustomerTable({
  customers,
  judgments,
  onSelect,
}: {
  customers: CustomerSummary[];
  judgments: CustomerJudgment[];
  onSelect: (index: number) => void;
}) {
  const judgmentByName = new Map(judgments.map((j) => [j.customer, j]));

  return (
    <div className="border-t border-rule">
      {/* Column headers — desktop only. On mobile, each row is a self-labeling card. */}
      <div className="hidden grid-cols-[minmax(200px,1.6fr)_140px_160px_170px_minmax(220px,1.8fr)] items-start gap-6 border-b border-rule px-6 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400 md:grid">
        <div>Customer</div>
        <div className="text-right">Open balance</div>
        <div>Behavior</div>
        <div>Confidence</div>
        <div>Action</div>
      </div>

      {customers.map((c, i) => {
        const j = judgmentByName.get(c.customer);
        if (!j) return null;
        return (
          <button
            key={c.customer}
            type="button"
            onClick={() => onSelect(i)}
            className="block w-full border-b border-rule px-5 py-4 text-left transition-colors duration-150 hover:bg-ink-50 focus:outline-none focus-visible:bg-ink-50 md:grid md:grid-cols-[minmax(200px,1.6fr)_140px_160px_170px_minmax(220px,1.8fr)] md:items-start md:gap-6 md:px-6"
          >
            {/* Customer (+ mobile-only inline balance) */}
            <div className="flex items-start justify-between gap-4 md:block">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-ink-900 md:whitespace-nowrap">
                  {c.customer}
                </div>
                <div className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-ink-400">
                  {c.paid_count}/{c.invoice_count} paid &middot; {c.avg_days_late}d avg late
                </div>
              </div>
              <div className="shrink-0 font-mono tabular text-[14px] text-ink-900 md:hidden">
                {fmtUSD(c.open_balance_cents)}
              </div>
            </div>

            {/* Open balance — desktop column */}
            <div className="hidden text-right font-mono tabular text-[14px] text-ink-900 md:block">
              {fmtUSD(c.open_balance_cents)}
            </div>

            {/* Pill + confidence — grouped on mobile, separate columns on desktop */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 md:hidden">
              <ArchetypePill archetype={j.archetype} />
              <ConfidenceBar value={j.confidence} flagged={j.needs_human_review} />
            </div>
            <div className="hidden md:block">
              <ArchetypePill archetype={j.archetype} />
            </div>
            <div className="hidden md:block">
              <ConfidenceBar value={j.confidence} flagged={j.needs_human_review} />
            </div>

            {/* Action */}
            <div className="mt-2 flex items-center justify-between gap-3 md:mt-0">
              <span className="truncate text-[13px] text-ink-600">
                {j.recommended_action}
              </span>
              {j.suggested_touch && (
                <span className="whitespace-nowrap font-mono text-[11px] text-ink-500">
                  See touch →
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
