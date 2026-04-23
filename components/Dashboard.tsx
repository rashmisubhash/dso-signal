"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import type { AnalysisResult, Invoice } from "@/lib/types";
import { mockInvoices, mockInvoicesAsCSV } from "@/lib/mockData";
import ForecastCard from "./ForecastCard";
import CustomerTable from "./CustomerTable";
import ExposureBars from "./ExposureBars";
import TouchDrawer from "./TouchDrawer";

type ApiResult = AnalysisResult & { used_fallback: boolean };

function parseCSVRow(row: Record<string, unknown>): Invoice | null {
  const amount = Number(row.amount_cents);
  const status = String(row.status ?? "").toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (status !== "paid" && status !== "open" && status !== "overdue") return null;
  const paid_raw = row.paid_date;
  const paid_date =
    paid_raw === null || paid_raw === undefined || paid_raw === ""
      ? null
      : String(paid_raw);
  return {
    invoice_id: String(row.invoice_id ?? ""),
    customer: String(row.customer ?? ""),
    amount_cents: amount,
    issued_date: String(row.issued_date ?? ""),
    due_date: String(row.due_date ?? ""),
    paid_date,
    status: status as Invoice["status"],
  };
}

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>(mockInvoices);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyze = useCallback(async (inv: Invoice[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices: inv }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }
      const data = (await res.json()) as ApiResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyze failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    analyze(mockInvoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data as Record<string, unknown>[])
          .map(parseCSVRow)
          .filter((r): r is Invoice => r !== null);
        if (rows.length === 0) {
          setError("No valid invoices found in CSV.");
          return;
        }
        setInvoices(rows);
        setError(null);
      },
      error: () => setError("Failed to parse CSV."),
    });
  };

  const handleDownload = () => {
    const blob = new Blob([mockInvoicesAsCSV()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-ar-aging.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selected =
    selectedIndex !== null && result
      ? {
          summary: result.customers[selectedIndex],
          judgment: result.judgments.find(
            (j) => j.customer === result.customers[selectedIndex].customer,
          ) ?? null,
        }
      : { summary: null, judgment: null };

  const generatedAt = result?.generated_at
    ? new Date(result.generated_at).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <main className="mx-auto max-w-[1100px] px-5 pb-20 pt-10 md:px-8 md:pb-24 md:pt-16">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-rule pb-8">
        <div>
          <h1 className="font-serif text-[36px] leading-none text-ink-950 md:text-[44px]">
            DSO Signal
          </h1>
          <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-400">
            A cashflow wedge for AR teams &nbsp;·&nbsp; Built for Monk
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border border-rule px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-700 transition-colors hover:bg-ink-50"
          >
            Upload CSV
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500 hover:text-ink-900"
          >
            Sample CSV ↓
          </button>
          <button
            type="button"
            onClick={() => analyze(invoices)}
            disabled={loading}
            className="border border-accent bg-accent px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </header>

      <p className="mt-8 max-w-[720px] font-serif text-[18px] italic leading-relaxed text-ink-500">
        An upstream triage layer for AR automation — deterministic cashflow
        forecasts paired with confidence-scored collection judgments. Math you
        can audit, judgment you can override.
      </p>

      {error && (
        <div className="mt-6 border-l-2 border-signal-risk bg-signal-risk/5 px-4 py-3 font-mono text-[12px] text-signal-risk">
          {error}
        </div>
      )}

      {result && (
        <>
          <section className="mt-12 grid grid-cols-1 divide-y divide-rule border-t border-rule md:grid-cols-3 md:divide-x md:divide-y-0">
            <ForecastCard forecast={result.forecast.d30} />
            <ForecastCard forecast={result.forecast.d60} />
            <ForecastCard forecast={result.forecast.d90} />
          </section>

          <p className="mx-auto mt-6 max-w-[58ch] text-center font-serif text-[13px] italic leading-snug text-ink-400">
            Per-customer p(collect) blends historical lateness with current aging. Band scales with portfolio variance.
          </p>

          <div className="mt-16">
            <ExposureBars result={result} />
          </div>

          <section className="mt-16">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="font-serif text-[24px] text-ink-950">
                Customers
              </h2>
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
                Sorted by open balance
              </div>
            </div>
            <CustomerTable
              customers={result.customers}
              judgments={result.judgments}
              onSelect={(i) => setSelectedIndex(i)}
            />
          </section>

          <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6 font-mono text-[11px] text-ink-400">
            <div>
              {result.flagged_count} of {result.customers.length} customers
              flagged for human review
            </div>
            <div className="flex items-center gap-5">
              {result.used_fallback && (
                <span className="text-signal-warn">
                  Heuristic fallback — set BEDROCK_API_KEY for Claude judgment
                </span>
              )}
              {generatedAt && <span>Generated {generatedAt}</span>}
            </div>
          </footer>
        </>
      )}

      <TouchDrawer
        open={selectedIndex !== null}
        onClose={() => setSelectedIndex(null)}
        summary={selected.summary ?? null}
        judgment={selected.judgment ?? null}
      />
    </main>
  );
}
