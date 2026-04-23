import { fmtUSD } from "./analytics";
import type {
  CollectionArchetype,
  CustomerJudgment,
  CustomerSummary,
  SuggestedTouch,
} from "./types";

export const CONFIDENCE_THRESHOLD = 0.7;

const DEFAULT_REGION = "us-east-1";
const DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

const VALID_ARCHETYPES: ReadonlyArray<CollectionArchetype> = [
  "reliable",
  "gentle_nudge",
  "needs_escalation",
  "at_risk",
  "insufficient_data",
];

// Single source of truth for archetype classification.
// Thresholds, in precedence order. The LLM is told what an archetype is but
// never gets to pick it — this function does, and its output is enforced
// after the LLM response.
//
// Precedence note: at_risk is checked BEFORE insufficient_data. A hard
// collection signal (oldest open > 60d OR avg > 45d) dominates "we don't
// have enough history yet." A customer with 3 overdue invoices and a
// 124-day-old receivable is not "insufficient_data" — we know exactly
// what's happening. Missing history only matters when there's no other
// signal to act on.
export function deterministicArchetypeFloor(s: CustomerSummary): CollectionArchetype {
  if (s.oldest_open_days > 60 || s.avg_days_late > 45) return "at_risk";
  if (s.paid_count < 2) return "insufficient_data";
  if (s.avg_days_late > 20) return "needs_escalation";
  if (s.avg_days_late > 5) return "gentle_nudge";
  return "reliable";
}

const SYSTEM_PROMPT = `You are a collections-triage analyst for a B2B SaaS finance team. Each customer has ALREADY been assigned an archetype by deterministic threshold rules upstream. Your job is to EXPLAIN why that archetype applies, RECOMMEND a concrete action, and DRAFT a first-touch email where appropriate. You do not classify. You do not re-evaluate thresholds. The archetype is fixed.

The five archetypes:
- reliable — pays on time or within a day or two.
- gentle_nudge — a pattern of consistent mild lateness (6–20 avg days late).
- needs_escalation — chronic late payer (21–45 avg days late) who needs a firmer touch.
- at_risk — material collection risk (oldest open invoice > 60d OR avg days late > 45).
- insufficient_data — fewer than 2 paid invoices on record.

CONFIDENCE (0.0 to 1.0):
Confidence refers to how confident you are in the recommendation and drafted touch — NOT the classification, which is deterministic and certain.
- Cap at 0.6 when history is thin (paid_count < 3).
- Go above 0.85 only when the pattern is crystal clear and the recommendation is obvious.
- Borderline cases should sit between 0.55 and 0.75.

REASONING RULES:
- One or two sentences, declarative English.
- State the finding directly. No hedging phrases like "may be", "is close", "appears to", "seems".
- Reference the specific numbers (avg days late, oldest open days, paid count).
- No run-on sentences. No "but" chained to "despite" chained to "however".

SUGGESTED TOUCH RULES:
- For archetype "reliable": suggested_touch MUST be null. Do not write an email for customers who don't need one.
- For all other archetypes: write a short, warm, human first-touch email.
- NEVER templated. NEVER "per our records" or "kindly remit". Reference the specific situation — how late, how much, their pattern.
- 3 to 5 sentences. Subject line concrete, not generic.
- Tone calibrated to archetype: gentle_nudge is friendly and light; needs_escalation is direct but respectful; at_risk is serious and asks for a call; insufficient_data is a warm check-in.
- Assume you're from "the finance team at [Vendor]" — do not invent a sender name.
- The draft must be grammatically clean and readable aloud without awkwardness.

OUTPUT FORMAT:
Return a JSON array, one object per customer, in the same order you received them. No prose, no code fences, no preamble — just the JSON array.

Each object shape:
{
  "customer": string (exact name, matches input),
  "archetype": string (same as input — do not change),
  "confidence": number in [0, 1],
  "reasoning": string,
  "recommended_action": string (one imperative sentence for the AR operator),
  "suggested_touch": null OR { "channel": "email", "subject": string, "body": string }
}`;

function summaryToPrompt(s: CustomerSummary, archetype: CollectionArchetype): string {
  return `- ${s.customer} [${archetype}]: open ${fmtUSD(s.open_balance_cents)}, ` +
    `lifetime billed ${fmtUSD(s.total_invoiced_cents)}, paid ${s.paid_count}/${s.invoice_count} invoices, ` +
    `avg ${s.avg_days_late} days late, oldest open invoice ${s.oldest_open_days} days past due.`;
}

export function deterministicFallback(summary: CustomerSummary): CustomerJudgment {
  const archetype = deterministicArchetypeFloor(summary);
  return {
    customer: summary.customer,
    archetype,
    confidence: 0.55,
    reasoning: `Heuristic classification only: avg ${summary.avg_days_late}d late, oldest open ${summary.oldest_open_days}d, ${summary.paid_count}/${summary.invoice_count} paid.`,
    recommended_action: "Review manually — LLM judgment unavailable.",
    suggested_touch: {
      channel: "email",
      subject: "[LLM unavailable]",
      body: "Bedrock API key missing or call failed. This customer was classified by heuristic only. Draft a first-touch email manually, or retry once BEDROCK_API_KEY is configured.",
    },
    needs_human_review: true,
  };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function validateTouch(raw: unknown): SuggestedTouch | null {
  if (!isRecord(raw)) return null;
  const subject = raw.subject;
  const body = raw.body;
  if (typeof subject !== "string" || typeof body !== "string") return null;
  if (subject.length === 0 || body.length === 0) return null;
  return { channel: "email", subject, body };
}

function validateOne(
  raw: unknown,
  summary: CustomerSummary,
): CustomerJudgment | null {
  if (!isRecord(raw)) return null;

  const archetype = raw.archetype;
  if (
    typeof archetype !== "string" ||
    !VALID_ARCHETYPES.includes(archetype as CollectionArchetype)
  ) {
    return null;
  }

  const rawConfidence = typeof raw.confidence === "number" ? raw.confidence : 0;
  const confidence = Math.max(0, Math.min(1, rawConfidence));

  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning : "";
  const recommended_action =
    typeof raw.recommended_action === "string" ? raw.recommended_action : "";

  const suggested_touch =
    archetype === "reliable" ? null : validateTouch(raw.suggested_touch);

  return {
    customer: summary.customer,
    archetype: archetype as CollectionArchetype,
    confidence,
    reasoning,
    recommended_action,
    suggested_touch,
    needs_human_review: confidence < CONFIDENCE_THRESHOLD,
  };
}

// Bedrock's Claude invoke endpoint accepts the same message format as the
// Anthropic API, with `anthropic_version: "bedrock-2023-05-31"` in the body
// and a Bearer token (AWS Bedrock long-term API key) in the Authorization
// header. No SigV4 signing required.
interface BedrockResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function callBedrock(
  apiKey: string,
  userMessage: string,
): Promise<string | null> {
  const region = process.env.BEDROCK_REGION ?? DEFAULT_REGION;
  const modelId = process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID;
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as BedrockResponse;
  const textBlock = data.content?.find((b) => b.type === "text");
  return textBlock?.text ?? null;
}

export async function judgeCustomers(
  summaries: CustomerSummary[],
  apiKey: string | undefined,
): Promise<CustomerJudgment[]> {
  if (!apiKey) {
    return summaries.map(deterministicFallback);
  }

  // Archetypes are deterministic and computed BEFORE the LLM call.
  // The model gets them as input and is told not to change them.
  const archetypes = summaries.map(deterministicArchetypeFloor);
  const userMessage =
    `For each customer below, write reasoning, recommended_action, and suggested_touch. The archetype is already assigned — do NOT change it. Return JSON array in the same order.\n\n` +
    summaries.map((s, i) => summaryToPrompt(s, archetypes[i])).join("\n");

  let responseText: string | null;
  try {
    responseText = await callBedrock(apiKey, userMessage);
  } catch {
    return summaries.map(deterministicFallback);
  }

  if (!responseText) {
    return summaries.map(deterministicFallback);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(responseText));
  } catch {
    return summaries.map(deterministicFallback);
  }

  if (!Array.isArray(parsed)) {
    return summaries.map(deterministicFallback);
  }

  const byName = new Map<string, unknown>();
  for (const item of parsed) {
    if (isRecord(item) && typeof item.customer === "string") {
      byName.set(item.customer, item);
    }
  }

  return summaries.map((s, i) => {
    const raw = byName.get(s.customer);
    const validated = raw ? validateOne(raw, s) : null;
    if (!validated) return deterministicFallback(s);

    // Deterministic archetype floor. If the LLM disagreed, overwrite — the
    // threshold rule wins. Reasoning, action, and touch are still the model's.
    const deterministic = archetypes[i];
    if (validated.archetype !== deterministic) {
      validated.archetype = deterministic;
    }
    return validated;
  });
}
