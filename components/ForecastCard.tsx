import type { CashForecast } from "@/lib/types";
import { fmtUSD } from "@/lib/analytics";

function abbrevUSD(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(dollars / 1_000)}K`;
  return `$${Math.round(dollars)}`;
}

export default function ForecastCard({ forecast }: { forecast: CashForecast }) {
  const expectedNoSign = fmtUSD(forecast.expected_cents).replace("$", "");

  return (
    <div className="group relative flex flex-col border-b border-rule bg-paper px-6 py-7 transition-colors duration-200 hover:bg-ink-50">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
        {forecast.horizon_days}-day outlook
      </div>

      <div className="mt-5 flex items-baseline gap-1 font-serif tabular text-ink-950">
        <span className="text-[20px] leading-none text-ink-300">$</span>
        <span className="text-[48px] leading-none">{expectedNoSign}</span>
      </div>

      <div className="mt-3 font-mono tabular text-[12px] text-ink-500">
        {abbrevUSD(forecast.low_cents)} &mdash; {abbrevUSD(forecast.high_cents)}
      </div>
    </div>
  );
}
