export type PrivacyTransaction = {
  id: string;
  sourceType: "tuition_payment" | "tuition_refund" | "expense" | "other_revenue";
  paymentMethod: string | null;
  date: string;
  amount: number;
  direction: "in" | "out";
  branchId: string | null;
  studentId: string | null;
  classId: string | null;
  description: string;
};

export function filterPrivacyTransactions(
  transactions: PrivacyTransaction[],
  startDate: string,
  endDate: string,
  branchId: string | null,
) {
  return transactions.filter((transaction) =>
    transaction.paymentMethod === "transfer" &&
    transaction.date >= startDate &&
    transaction.date < endDate &&
    (!branchId || transaction.branchId === branchId)
  );
}

export function excludeReversedPrivacySources(
  transactions: PrivacyTransaction[],
  reversals: Array<{ source_type: string; source_id: string }>,
) {
  const reversed = new Set(reversals.map((row) => `${row.source_type}:${row.source_id}`));
  return transactions.filter((row) => !reversed.has(`${row.sourceType}:${row.id}`));
}

export type PrivacyLedgerRow = {
  id: string;
  business_date: string;
  direction: "in" | "out";
  amount: number;
  description: string;
  branch_id: string | null;
  source_type: string;
  source_id: string | null;
  reversal_of: string | null;
};

export function resolveTransferLedgerRows(
  ledgerRows: PrivacyLedgerRow[],
  transferSources: Map<string, PrivacyTransaction>,
) {
  const reversedIds = new Set(ledgerRows.map((row) => row.reversal_of).filter((id): id is string => Boolean(id)));
  return ledgerRows.flatMap((row) => {
    if (row.reversal_of || reversedIds.has(row.id)) return [];
    if (!row.source_id || !["tuition_payment", "tuition_refund", "expense", "other_revenue"].includes(row.source_type)) return [];
    const source = transferSources.get(`${row.source_type}:${row.source_id}`);
    if (source?.paymentMethod !== "transfer") return [];
    return [{
      id: row.id,
      sourceType: source.sourceType,
      paymentMethod: "transfer",
      date: row.business_date,
      amount: Number(row.amount),
      direction: row.direction,
      branchId: row.branch_id,
      studentId: source.studentId,
      classId: source.classId,
      description: row.description,
    }];
  });
}

export function summarizePrivacyTransactions(transactions: PrivacyTransaction[]) {
  let income = 0;
  let expense = 0;
  const studentIds = new Set<string>();

  for (const transaction of transactions) {
    if (transaction.paymentMethod !== "transfer") continue;
    if (transaction.direction === "in") income += transaction.amount;
    else expense += transaction.amount;
    if (transaction.studentId && transaction.sourceType === "tuition_payment") {
      studentIds.add(transaction.studentId);
    }
  }

  return { income, expense, net: income - expense, studentCount: studentIds.size, studentIds };
}
