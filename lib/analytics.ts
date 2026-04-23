import type {
  CashForecast,
  CustomerSummary,
  ForecastBundle,
  ForecastHorizon,
  Invoice,
} from "./types";

// Deterministic numbers, probabilistic judgment.
// Monk engineering principle: layer deterministic business rules on top of
// probabilistic extraction. Finance teams need numbers they can audit line
// by line — anything that shows up on a dashboard, in a forecast, or in a
// collections queue is computed here, not by a model.

const MS_PER_DAY = 86_400_000;

function parseISODate(iso: string): Date {
  // Force UTC so DST transitions don't shift day counts.
  return new Date(`${iso}T00:00:00Z`);
}

function daysBetween(earlier: string | Date, later: string | Date): number {
  const a = typeof earlier === "string" ? parseISODate(earlier) : earlier;
  const b = typeof later === "string" ? parseISODate(later) : later;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function toUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function summarizeCustomers(
  invoices: Invoice[],
  asOf: Date = new Date(),
): CustomerSummary[] {
  const today = toUTC(asOf);
  const byCustomer = new Map<string, Invoice[]>();

  for (const inv of invoices) {
    const arr = byCustomer.get(inv.customer) ?? [];
    arr.push(inv);
    byCustomer.set(inv.customer, arr);
  }

  const summaries: CustomerSummary[] = [];

  for (const [customer, custInvoices] of byCustomer) {
    let open_balance_cents = 0;
    let total_invoiced_cents = 0;
    let total_paid_cents = 0;
    let paid_count = 0;
    let lateDaysSum = 0;
    let oldest_open_days = 0;

    for (const inv of custInvoices) {
      total_invoiced_cents += inv.amount_cents;

      if (inv.status === "paid" && inv.paid_date) {
        total_paid_cents += inv.amount_cents;
        paid_count += 1;
        // Clamp at 0 — paying early is not "negative lateness", it's on time.
        const late = Math.max(0, daysBetween(inv.due_date, inv.paid_date));
        lateDaysSum += late;
      } else {
        open_balance_cents += inv.amount_cents;
        const pastDue = daysBetween(inv.due_date, today);
        if (pastDue > oldest_open_days) oldest_open_days = pastDue;
      }
    }

    const avg_days_late = paid_count > 0 ? lateDaysSum / paid_count : 0;

    summaries.push({
      customer,
      open_balance_cents,
      total_invoiced_cents,
      total_paid_cents,
      avg_days_late: Math.round(avg_days_late * 10) / 10,
      oldest_open_days: Math.max(0, oldest_open_days),
      invoice_count: custInvoices.length,
      paid_count,
    });
  }

  summaries.sort((a, b) => b.open_balance_cents - a.open_balance_cents);
  return summaries;
}

// Per-customer probability of collecting within a horizon.
// Base: how likely to collect within the horizon given historical lateness.
// - If avg_days_late is well under horizon, p grows with horizon (slack
//   customers get more credit as the window widens).
// - If avg_days_late exceeds horizon, p decays exponentially.
// Aging penalty scales with horizon — near-term collection of a 120-day-old
// invoice is unlikely, but a 90-day horizon gives it more runway. This is
// what keeps d60 and d90 from collapsing onto each other.
function collectionProbability(
  avgDaysLate: number,
  oldestOpenDays: number,
  horizonDays: number,
): number {
  const gap = avgDaysLate - horizonDays;
  let p: number;
  if (gap <= 0) {
    const slack = -gap;
    p = 0.70 + 0.28 * (1 - Math.exp(-slack / 45));
  } else {
    p = 0.70 * Math.exp(-gap / 30);
  }

  const horizonRelief = Math.min(1, horizonDays / 90);
  if (oldestOpenDays > 90) p *= 0.35 + 0.15 * horizonRelief;
  else if (oldestOpenDays > 60) p *= 0.60 + 0.15 * horizonRelief;
  else if (oldestOpenDays > 30) p *= 0.82 + 0.10 * horizonRelief;

  return Math.max(0.02, Math.min(0.98, p));
}

function portfolioAvgLateness(summaries: CustomerSummary[]): number {
  const totalBalance = summaries.reduce((s, c) => s + c.open_balance_cents, 0);
  if (totalBalance === 0) return 0;
  const weighted = summaries.reduce(
    (s, c) => s + c.open_balance_cents * c.avg_days_late,
    0,
  );
  return weighted / totalBalance;
}

function buildForecastForHorizon(
  summaries: CustomerSummary[],
  horizon_days: ForecastHorizon,
  avgLateness: number,
): CashForecast {
  let expected = 0;
  let billed_outstanding = 0;

  for (const c of summaries) {
    billed_outstanding += c.open_balance_cents;
    const p = collectionProbability(c.avg_days_late, c.oldest_open_days, horizon_days);
    expected += c.open_balance_cents * p;
  }

  // Portfolios with more historical lateness get wider bands — we know less
  // about when cash will actually land. Cap at ±35% so the band stays useful.
  const band_spread = Math.min(0.35, 0.12 + avgLateness / 200);
  const low = expected * (1 - band_spread);
  const high = expected * (1 + band_spread);

  return {
    horizon_days,
    expected_cents: Math.round(expected),
    low_cents: Math.round(low),
    high_cents: Math.round(high),
    billed_outstanding_cents: billed_outstanding,
    method: "Per-customer p(collect) blends historical lateness with current aging. Band scales with portfolio variance.",
  };
}

export function buildForecasts(summaries: CustomerSummary[]): ForecastBundle {
  const avgLateness = portfolioAvgLateness(summaries);
  return {
    d30: buildForecastForHorizon(summaries, 30, avgLateness),
    d60: buildForecastForHorizon(summaries, 60, avgLateness),
    d90: buildForecastForHorizon(summaries, 90, avgLateness),
  };
}

// Guardrail: anything deterministic should be internally consistent. If a
// forecast violates these invariants, something is wrong with the math or
// the input — surface it loudly rather than ship a broken number.
export function validateForecast(
  forecast: CashForecast,
  summaries: CustomerSummary[],
): string[] {
  const errors: string[] = [];
  const billed = summaries.reduce((s, c) => s + c.open_balance_cents, 0);

  if (forecast.expected_cents < 0) {
    errors.push("expected_cents is negative");
  }
  if (forecast.expected_cents > billed) {
    errors.push(
      `expected_cents (${forecast.expected_cents}) exceeds total billed outstanding (${billed})`,
    );
  }
  if (forecast.low_cents > forecast.expected_cents) {
    errors.push("low_cents exceeds expected_cents — band does not bracket expected");
  }
  if (forecast.high_cents < forecast.expected_cents) {
    errors.push("high_cents is below expected_cents — band does not bracket expected");
  }
  if (forecast.low_cents < 0) {
    errors.push("low_cents is negative");
  }
  if (forecast.billed_outstanding_cents !== billed) {
    errors.push(
      `forecast.billed_outstanding_cents (${forecast.billed_outstanding_cents}) disagrees with summed balances (${billed})`,
    );
  }
  return errors;
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function fmtUSD(cents: number): string {
  return USD.format(Math.round(cents / 100));
}
