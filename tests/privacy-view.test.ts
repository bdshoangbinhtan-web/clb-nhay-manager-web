import assert from "node:assert/strict";
import test from "node:test";
import { buildTransferLedgerSourceBatches, excludeReversedPrivacySources, filterPrivacyTransactions, matchedTransferRefundBatchIds, resolveTransferLedgerRows, summarizePrivacyTransactions, type PrivacyLedgerRow, type PrivacyTransaction } from "../lib/privacy-view.ts";

const transaction = (
  id: string,
  overrides: Partial<PrivacyTransaction> = {},
): PrivacyTransaction => ({
  id,
  sourceType: "tuition_payment",
  paymentMethod: "transfer",
  date: "2026-10-15",
  amount: 500000,
  direction: "in",
  branchId: "cs1",
  studentId: "student-1",
  classId: "class-1",
  description: "Thu học phí",
  ...overrides,
});

test("only transfer transactions in the selected dates and branch affect totals", () => {
  const rows = [
    transaction("transfer-1"),
    transaction("cash-only", { paymentMethod: "cash", studentId: "student-2", amount: 700000 }),
    transaction("mixed-cash", { paymentMethod: "cash", amount: 200000 }),
    transaction("mixed-transfer", { amount: 300000 }),
    transaction("other-branch", { branchId: "cs2", studentId: "student-3", amount: 900000 }),
    transaction("outside-month", { date: "2026-11-01", studentId: "student-4" }),
    transaction("bank-expense", { sourceType: "expense", studentId: null, classId: null, direction: "out", amount: 100000 }),
  ];
  const selected = filterPrivacyTransactions(rows, "2026-10-01", "2026-11-01", "cs1");
  assert.deepEqual(selected.map((row) => row.id), ["transfer-1", "mixed-transfer", "bank-expense"]);
  assert.deepEqual(summarizePrivacyTransactions(selected), {
    income: 800000,
    expense: 100000,
    net: 700000,
    studentCount: 1,
    studentIds: new Set(["student-1"]),
  });
});

test("student count uses distinct transfer tuition payments only", () => {
  const rows = filterPrivacyTransactions([
    transaction("payment-1"),
    transaction("payment-2", { studentId: "student-1", amount: 100000 }),
    transaction("refund", { sourceType: "tuition_refund", direction: "out", amount: 50000 }),
    transaction("student-2", { studentId: "student-2" }),
    transaction("refund-only", { sourceType: "tuition_refund", studentId: "student-4", direction: "out", amount: 10000 }),
    transaction("cash-student", { studentId: "student-3", paymentMethod: "cash" }),
  ], "2026-10-01", "2026-11-01", null);
  const summary = summarizePrivacyTransactions(rows);
  assert.equal(summary.studentCount, 2);
  assert.deepEqual(summary.studentIds, new Set(["student-1", "student-2"]));
  assert.equal(summary.income, 1100000);
  assert.equal(summary.expense, 60000);
});

test("ledger rows resolve through transfer sources, never the bank account", () => {
  const ledger = (id: string, source_type: string, source_id: string | null, overrides: Partial<PrivacyLedgerRow> = {}): PrivacyLedgerRow => ({
    id, business_date: "2026-10-15", direction: "in", amount: 500000,
    description: id, branch_id: "cs1", source_type, source_id, reversal_of: null, ...overrides,
  });
  const sources = new Map<string, PrivacyTransaction>([
    ["tuition_payment:transfer", transaction("transfer")],
    ["expense:expense", transaction("expense", { sourceType: "expense", studentId: null, direction: "out", amount: 100000 })],
    ["expense:effective-expense", transaction("effective-expense", { sourceType: "expense", studentId: null, direction: "out", amount: 40000 })],
    ["other_revenue:cash", transaction("cash", { sourceType: "other_revenue", paymentMethod: "cash", studentId: null })],
  ]);
  const rows = resolveTransferLedgerRows([
    ledger("payment-ledger", "tuition_payment", "transfer"),
    ledger("expense-ledger", "expense", "expense", { direction: "out", amount: 100000 }),
    ledger("effective-expense-ledger", "expense", "effective-expense", { direction: "out", amount: 40000 }),
    ledger("cash-in-bank", "other_revenue", "cash"),
    ledger("opening", "opening_balance", "opening-id"),
    ledger("internal-transfer", "account_transfer", "transfer-id"),
    ledger("expense-reversal", "reversal", "expense-ledger", { reversal_of: "expense-ledger", direction: "in", amount: 100000 }),
    ledger("opening-reversal", "reversal", "opening", { reversal_of: "opening", direction: "out" }),
  ], sources, new Map());
  assert.deepEqual(rows.map((row) => row.id), ["payment-ledger", "effective-expense-ledger"]);
  assert.deepEqual(summarizePrivacyTransactions(rows), {
    income: 500000, expense: 40000, net: 460000,
    studentCount: 1, studentIds: new Set(["student-1"]),
  });
});

test("ledger lookup batches contain only allowed transfer source IDs and constrain refund amounts", () => {
  assert.deepEqual(buildTransferLedgerSourceBatches(
    [
      transaction("payment-1"), transaction("payment-2"), transaction("payment-3"),
      transaction("cash-payment", { paymentMethod: "cash" }),
      transaction("expense-1", { sourceType: "expense", direction: "out" }),
      transaction("cash-expense", { sourceType: "expense", paymentMethod: "cash", direction: "out" }),
      transaction("revenue-1", { sourceType: "other_revenue" }),
    ], new Map([["refund-1", 300000], ["refund-2", 300000], ["refund-3", 500000]]), 2,
  ), [
    { sourceType: "tuition_payment", sourceIds: ["payment-1", "payment-2"] },
    { sourceType: "tuition_payment", sourceIds: ["payment-3"] },
    { sourceType: "expense", sourceIds: ["expense-1"] },
    { sourceType: "other_revenue", sourceIds: ["revenue-1"] },
    { sourceType: "tuition_refund", sourceIds: ["refund-1", "refund-2"], amount: 300000 },
    { sourceType: "tuition_refund", sourceIds: ["refund-3"], amount: 500000 },
  ]);
});

test("refund ledger is excluded when its amount differs from transfer refund rows", () => {
  const sources = new Map<string, PrivacyTransaction>([
    ["tuition_refund:valid", transaction("valid", { sourceType: "tuition_refund", direction: "out", amount: 200000 })],
    ["tuition_refund:mixed", transaction("mixed", { sourceType: "tuition_refund", direction: "out", amount: 200000 })],
  ]);
  const ledger = (id: string, amount: number): PrivacyLedgerRow => ({
    id, business_date: "2026-10-15", direction: "out", amount, description: id,
    branch_id: "cs1", source_type: "tuition_refund", source_id: id, reversal_of: null,
  });
  const rows = resolveTransferLedgerRows([ledger("valid", 200000), ledger("mixed", 300000)],
    sources, new Map([["valid", 200000], ["mixed", 200000]]));
  assert.deepEqual(rows.map((row) => row.id), ["valid"]);
  assert.deepEqual(matchedTransferRefundBatchIds(
    [ledger("valid", 200000), ledger("mixed", 300000)],
    new Map([["valid", 200000], ["mixed", 200000]]),
  ), new Set(["valid"]));
});

test("a corrected transfer expense or revenue no longer contributes to the visible total", () => {
  const rows = [
    transaction("expense-old", { sourceType: "expense", direction: "out", studentId: null, amount: 500000 }),
    transaction("expense-new", { sourceType: "expense", direction: "out", studentId: null, amount: 300000 }),
    transaction("revenue-old", { sourceType: "other_revenue", studentId: null, amount: 400000 }),
  ];
  const effective = excludeReversedPrivacySources(rows, [
    { source_type: "expense", source_id: "expense-old" },
    { source_type: "other_revenue", source_id: "revenue-old" },
  ]);
  assert.deepEqual(effective.map((row) => row.id), ["expense-new"]);
  assert.equal(summarizePrivacyTransactions(effective).expense, 300000);
});
