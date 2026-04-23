export type InvoiceStatus = "paid" | "open" | "overdue";

export interface Invoice {
  invoice_id: string;
  customer: string;
  amount_cents: number;
  issued_date: string;
  due_date: string;
  paid_date: string | null;
  status: InvoiceStatus;
}

export interface CustomerSummary {
  customer: string;
  open_balance_cents: number;
  total_invoiced_cents: number;
  total_paid_cents: number;
  avg_days_late: number;
  oldest_open_days: number;
  invoice_count: number;
  paid_count: number;
}

export type CollectionArchetype =
  | "reliable"
  | "gentle_nudge"
  | "needs_escalation"
  | "at_risk"
  | "insufficient_data";

export interface CustomerJudgment {
  customer: string;
  archetype: CollectionArchetype;
  confidence: number;
  reasoning: string;
  recommended_action: string;
  suggested_touch: SuggestedTouch | null;
  needs_human_review: boolean;
}

export interface SuggestedTouch {
  channel: "email";
  subject: string;
  body: string;
}

export type ForecastHorizon = 30 | 60 | 90;

export interface CashForecast {
  horizon_days: ForecastHorizon;
  expected_cents: number;
  low_cents: number;
  high_cents: number;
  billed_outstanding_cents: number;
  method: string;
}

export interface ForecastBundle {
  d30: CashForecast;
  d60: CashForecast;
  d90: CashForecast;
}

export interface AnalysisResult {
  customers: CustomerSummary[];
  judgments: CustomerJudgment[];
  forecast: ForecastBundle;
  flagged_count: number;
  generated_at: string;
}
