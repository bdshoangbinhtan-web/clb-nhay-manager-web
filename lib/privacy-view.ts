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

export function summarizePrivacyTransactions(transactions: PrivacyTransaction[]) {
  let income = 0;
  let expense = 0;
  const studentIds = new Set<string>();

  for (const transaction of transactions) {
    if (transaction.paymentMethod !== "transfer") continue;
    if (transaction.direction === "in") income += transaction.amount;
    else expense += transaction.amount;
    if (transaction.studentId &&
      (transaction.sourceType === "tuition_payment" || transaction.sourceType === "tuition_refund")) {
      studentIds.add(transaction.studentId);
    }
  }

  return { income, expense, net: income - expense, studentCount: studentIds.size, studentIds };
}
