import assert from "node:assert/strict";
import { test } from "node:test";
import { filterEffectiveSources } from "../lib/finance/ledger.ts";
import { buildExpenseDisplayView, filterExpensesByPeriod } from "../lib/expenses/display-view.ts";

type Expense = {
  id: string;
  branch_id: string | null;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string | null;
  note: string | null;
};

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    branch_id: "branch-a",
    expense_date: "2026-09-15",
    category: "salary",
    description: "Chi lương giáo viên - Cô A · payroll-123",
    amount: 1_000_000,
    payment_method: "transfer",
    note: "Ghi chú riêng Cô A",
    ...overrides,
  };
}

const defaults = {
  role: "manager",
  expenses: [] as Expense[],
  reversedSourceIds: new Set<string>(),
  filterBranch: "",
  filterCategory: "",
  filterMonth: "2026-09",
  search: "",
  salaryBranchLabel: "Toàn CLB",
};

function createView(options: typeof defaults) {
  const periodExpenses = filterExpensesByPeriod(
    options.expenses,
    options.filterBranch,
    options.filterCategory,
    options.filterMonth,
  );
  const effectiveExpenses = filterEffectiveSources(
    "expense",
    periodExpenses,
    [...options.reversedSourceIds].map((source_id) => ({ source_type: "expense", source_id })),
  );
  return buildExpenseDisplayView({
    role: options.role,
    expenses: periodExpenses,
    effectiveExpenses,
    search: options.search,
    filterMonth: options.filterMonth,
    salaryBranchLabel: options.salaryBranchLabel,
  });
}

test("manager sees one effective salary summary for salary and allowance rows without personal details", () => {
  const rows = [
    expense(),
    expense({ id: "expense-2", description: "Phụ cấp giáo viên - Cô A · payroll-123", amount: 200_000 }),
    expense({ id: "expense-3", description: "Chi lương giáo viên - Thầy B · payroll-456", amount: 1_500_000, note: "Ghi chú riêng Thầy B" }),
    expense({ id: "expense-reversed", description: "Phụ cấp giáo viên - Cô C · payroll-789", amount: 900_000 }),
    expense({ id: "rent", category: "rent", description: "Thuê phòng tháng 9", amount: 3_000_000, note: null, payment_method: "cash" }),
  ];
  const result = createView({
    ...defaults,
    expenses: rows,
    reversedSourceIds: new Set(["expense-reversed"]),
  });

  assert.equal(result.rows.filter((row) => row.type === "salary-summary").length, 1);
  const summary = result.rows.find((row) => row.type === "salary-summary");
  assert.ok(summary && summary.type === "salary-summary");
  assert.equal(summary.amount, 2_700_000);
  assert.equal(summary.dateLabel, "Tháng 09/2026");
  assert.equal(summary.branchLabel, "Toàn CLB");
  assert.equal(summary.categoryLabel, "👤 Lương");
  assert.equal(summary.statusLabel, "Đã ghi sổ");
  assert.equal("id" in summary, false);
  assert.equal("note" in summary, false);
  assert.equal("payment_method" in summary, false);
  assert.equal(result.rows.filter((row) => row.type === "expense").length, 1);
  assert.equal(result.total, 5_700_000);

  const renderedData = JSON.stringify(result.rows);
  for (const privateValue of ["Cô A", "Thầy B", "Cô C", "payroll-123", "payroll-456", "payroll-789", "Ghi chú riêng"]) {
    assert.equal(renderedData.includes(privateValue), false, `${privateValue} should not appear in manager rows`);
  }
});

test("manager search runs against the protected summary so a teacher name reveals no salary row or amount", () => {
  const result = createView({
    ...defaults,
    expenses: [expense(), expense({ id: "rent", category: "rent", description: "Thuê phòng", amount: 3_000_000, note: null })],
    search: "Cô A",
  });

  assert.deepEqual(result.rows, []);
  assert.equal(result.total, 0);
});

test("admin retains each salary and allowance row and the existing effective total", () => {
  const salary = expense();
  const allowance = expense({ id: "allowance", description: "Phụ cấp giáo viên - Cô A", amount: 200_000 });
  const result = createView({
    ...defaults,
    role: "admin",
    expenses: [salary, allowance],
  });

  assert.deepEqual(result.rows.map((row) => row.type === "expense" ? row.item.id : "summary"), ["expense-1", "allowance"]);
  assert.equal(result.rows[0].type === "expense" && result.rows[0].item.description, salary.description);
  assert.equal(result.rows[1].type === "expense" && result.rows[1].item.amount, allowance.amount);
  assert.equal(result.total, 1_200_000);
});

test("month, branch, and category filters are applied before the manager salary aggregation", () => {
  const expenses = [
    expense({ id: "branch-a-september", amount: 1_000_000 }),
    expense({ id: "branch-b-september", branch_id: "branch-b", amount: 2_000_000 }),
    expense({ id: "branch-a-august", expense_date: "2026-08-15", amount: 3_000_000 }),
    expense({ id: "branch-a-september-rent", category: "rent", amount: 4_000_000 }),
  ];
  const result = createView({
    ...defaults,
    expenses,
    filterBranch: "branch-a",
    filterCategory: "salary",
    salaryBranchLabel: "Cơ sở A",
  });
  const summary = result.rows.find((row) => row.type === "salary-summary");

  assert.ok(summary && summary.type === "salary-summary");
  assert.equal(summary.amount, 1_000_000);
  assert.equal(summary.branchLabel, "Cơ sở A");
  assert.equal(result.total, 1_000_000);
});

test("non-salary expenses stay visible and salary summary is counted only once in the total", () => {
  const result = createView({
    ...defaults,
    expenses: [
      expense({ amount: 1_000_000 }),
      expense({ id: "utilities", category: "utilities", description: "Tiền điện", amount: 500_000, note: null }),
    ],
  });

  assert.deepEqual(result.rows.map((row) => row.type), ["expense", "salary-summary"]);
  assert.equal(result.total, 1_500_000);
});
