export type LedgerEntry = {
  id: string;
  occurred_at: string;
  business_date: string;
  account_id: string;
  direction: "in" | "out";
  amount: number;
  category: string;
  description: string;
  branch_id: string | null;
  source_type: string;
  source_id: string | null;
  created_by_name: string | null;
  reversal_of: string | null;
  metadata: Record<string, unknown> | null;
  is_reversed_source?: boolean;
  account?: { id: string; name: string; account_type: "cash" | "bank" } | null;
};

export type LedgerSummary = {
  income: number;
  expense: number;
  net: number;
  transactions: number;
  adjustments: number;
};

export type SourceReversal = { source_type: string; source_id: string };

export function filterEffectiveSources<T extends { id: string }>(
  sourceType: string,
  rows: T[],
  reversals: SourceReversal[],
) {
  const reversedIds = new Set(
    reversals.filter((item) => item.source_type === sourceType).map((item) => item.source_id),
  );
  return rows.filter((row) => !reversedIds.has(row.id));
}

export function businessDateFromTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid timestamp");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  const reversedLedgerIds = new Set(
    entries.flatMap((entry) => entry.reversal_of ? [entry.reversal_of] : [])
  );
  const operating = entries.filter((entry) =>
    entry.source_type !== "account_transfer" &&
    entry.source_type !== "opening_balance" &&
    entry.source_type !== "reversal" &&
    !entry.reversal_of &&
    !entry.is_reversed_source &&
    !reversedLedgerIds.has(entry.id)
  );
  const income = operating.reduce(
    (total, entry) => total + (entry.direction === "in" ? Number(entry.amount) : 0),
    0,
  );
  const expense = operating.reduce(
    (total, entry) => total + (entry.direction === "out" ? Number(entry.amount) : 0),
    0,
  );

  return {
    income,
    expense,
    net: income - expense,
    transactions: operating.length,
    adjustments: entries.filter((entry) => entry.reversal_of !== null).length,
  };
}

export function accountBalances(entries: LedgerEntry[]) {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const signedAmount = Number(entry.amount) * (entry.direction === "in" ? 1 : -1);
    totals.set(entry.account_id, (totals.get(entry.account_id) ?? 0) + signedAmount);
  }
  return totals;
}
