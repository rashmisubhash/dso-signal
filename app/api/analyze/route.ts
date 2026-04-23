import { NextResponse } from "next/server";
import { buildForecasts, summarizeCustomers, validateForecast } from "@/lib/analytics";
import { deterministicFallback, judgeCustomers } from "@/lib/judge";
import type { AnalysisResult, Invoice } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isISODate(v: unknown): v is string {
  return typeof v === "string" && ISO_DATE.test(v);
}

function isInvoice(v: unknown): v is Invoice {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.invoice_id === "string" &&
    typeof o.customer === "string" &&
    typeof o.amount_cents === "number" &&
    Number.isFinite(o.amount_cents) &&
    isISODate(o.issued_date) &&
    isISODate(o.due_date) &&
    (o.paid_date === null || isISODate(o.paid_date)) &&
    (o.status === "paid" || o.status === "open" || o.status === "overdue")
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const rawInvoices = (body as { invoices?: unknown }).invoices;
  if (!Array.isArray(rawInvoices) || rawInvoices.length === 0) {
    return NextResponse.json(
      { error: "`invoices` must be a non-empty array" },
      { status: 400 },
    );
  }

  const invoices: Invoice[] = [];
  for (let i = 0; i < rawInvoices.length; i++) {
    const row = rawInvoices[i];
    if (!isInvoice(row)) {
      return NextResponse.json(
        { error: `Invoice at index ${i} is invalid` },
        { status: 400 },
      );
    }
    invoices.push(row);
  }

  const customers = summarizeCustomers(invoices);
  const forecast = buildForecasts(customers);

  // Guardrail: if deterministic math violates its own invariants, fail loudly.
  const forecastErrors = [
    ...validateForecast(forecast.d30, customers),
    ...validateForecast(forecast.d60, customers),
    ...validateForecast(forecast.d90, customers),
  ];
  if (forecastErrors.length > 0) {
    return NextResponse.json(
      { error: "Forecast validation failed", details: forecastErrors },
      { status: 500 },
    );
  }

  const apiKey = process.env.BEDROCK_API_KEY;
  let used_fallback = false;
  let judgments;

  if (!apiKey) {
    used_fallback = true;
    judgments = customers.map(deterministicFallback);
  } else {
    try {
      judgments = await judgeCustomers(customers, apiKey);
    } catch {
      used_fallback = true;
      judgments = customers.map(deterministicFallback);
    }
  }

  const flagged_count = judgments.filter((j) => j.needs_human_review).length;

  const result: AnalysisResult & { used_fallback: boolean } = {
    customers,
    judgments,
    forecast,
    flagged_count,
    generated_at: new Date().toISOString(),
    used_fallback,
  };

  return NextResponse.json(result);
}
