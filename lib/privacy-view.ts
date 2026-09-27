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

export type TransferLedgerSourceBatch = {
  sourceType: "tuition_payment" | "expense" | "other_revenue" | "tuition_refund";
  sourceIds: string[];
  amount?: number;
};

export function buildTransferLedgerSourceBatches(
  sources: PrivacyTransaction[],
  refundTotals: Map<string, number>,
  chunkSize = 100,
): TransferLedgerSourceBatch[] {
  const batches: TransferLedgerSourceBatch[] = [];
  const add = (sourceType: TransferLedgerSourceBatch["sourceType"], ids: string[], amount?: number) => {
    const uniqueIds = [...new Set(ids)];
    for (let index = 0; index < uniqueIds.length; index += chunkSize) {
      batches.push({ sourceType, sourceIds: uniqueIds.slice(index, index + chunkSize), ...(amount === undefined ? {} : { amount }) });
    }
  };
  const transferSources = sources.filter((source) => source.paymentMethod === "transfer");
  add("tuition_payment", transferSources.filter((source) => source.sourceType === "tuition_payment").map((source) => source.id));
  add("expense", transferSources.filter((source) => source.sourceType === "expense").map((source) => source.id));
  add("other_revenue", transferSources.filter((source) => source.sourceType === "other_revenue").map((source) => source.id));
  const refundsByAmount = new Map<number, string[]>();
  for (const [batchId, amount] of refundTotals) {
    refundsByAmount.set(amount, [...(refundsByAmount.get(amount) ?? []), batchId]);
  }
  for (const [amount, ids] of refundsByAmount) add("tuition_refund", ids, amount);
  return batches;
}

export function matchedTransferRefundBatchIds(ledgerRows: PrivacyLedgerRow[], refundTotals: Map<string, number>) {
  return new Set(ledgerRows.filter((row) => row.source_type === "tuition_refund" && row.source_id &&
    refundTotals.get(row.source_id) === Number(row.amount)).map((row) => row.source_id!));
}

export function resolveTransferLedgerRows(
  ledgerRows: PrivacyLedgerRow[],
  transferSources: Map<string, PrivacyTransaction>,
  transferRefundTotals: Map<string, number>,
) {
  const reversedIds = new Set(ledgerRows.map((row) => row.reversal_of).filter((id): id is string => Boolean(id)));
  return ledgerRows.flatMap((row) => {
    if (row.reversal_of || reversedIds.has(row.id)) return [];
    if (!row.source_id || !["tuition_payment", "tuition_refund", "expense", "other_revenue"].includes(row.source_type)) return [];
    const source = transferSources.get(`${row.source_type}:${row.source_id}`);
    if (source?.paymentMethod !== "transfer") return [];
    if (row.source_type === "tuition_refund" && transferRefundTotals.get(row.source_id) !== Number(row.amount)) return [];
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
