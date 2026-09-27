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
  account?: { id: string; name: string; account_type: "cash" | "bank" } | null;
};

export type LedgerSummary = {
  income: number;
  expense: number;
  net: number;
  transactions: number;
  adjustments: number;
};

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
  const operating = entries.filter((entry) => entry.source_type !== "account_transfer");
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
