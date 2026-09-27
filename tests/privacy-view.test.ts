import assert from "node:assert/strict";
import test from "node:test";
import { excludeReversedPrivacySources, filterPrivacyTransactions, summarizePrivacyTransactions, type PrivacyTransaction } from "../lib/privacy-view.ts";

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

test("student count uses distinct transfer student IDs, including refund transactions", () => {
  const rows = filterPrivacyTransactions([
    transaction("payment-1"),
    transaction("payment-2", { studentId: "student-1", amount: 100000 }),
    transaction("refund", { sourceType: "tuition_refund", direction: "out", amount: 50000 }),
    transaction("student-2", { studentId: "student-2" }),
    transaction("cash-student", { studentId: "student-3", paymentMethod: "cash" }),
  ], "2026-10-01", "2026-11-01", null);
  const summary = summarizePrivacyTransactions(rows);
  assert.equal(summary.studentCount, 2);
  assert.deepEqual(summary.studentIds, new Set(["student-1", "student-2"]));
  assert.equal(summary.income, 1100000);
  assert.equal(summary.expense, 50000);
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
