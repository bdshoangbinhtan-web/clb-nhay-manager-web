export type ExpenseDisplaySource = {
  id: string;
  branch_id: string | null;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  note: string | null;
};

export type ExpenseDisplayRow<T extends ExpenseDisplaySource> =
  | { type: "expense"; item: T }
  | {
      type: "salary-summary";
      dateLabel: string;
      branchLabel: string;
      categoryLabel: string;
      description: string;
      amount: number;
      statusLabel: string;
    };

export function filterExpensesByPeriod<T extends ExpenseDisplaySource>(
  expenses: T[],
  filterBranch: string,
  filterCategory: string,
  filterMonth: string,
) {
  return expenses.filter((item) => {
    if (filterBranch && item.branch_id !== filterBranch) return false;
    if (filterCategory && item.category !== filterCategory) return false;
    if (filterMonth && !item.expense_date.startsWith(filterMonth)) return false;
    return true;
  });
}

export function buildExpenseDisplayView<T extends ExpenseDisplaySource>(options: {
  role: string;
  expenses: T[];
  effectiveExpenses: T[];
  search: string;
  filterMonth: string;
  salaryBranchLabel: string;
}): { rows: ExpenseDisplayRow<T>[]; total: number } {
  const query = options.search.trim().toLowerCase();
  const matchesSearch = (item: ExpenseDisplaySource) =>
    !query ||
    item.description.toLowerCase().includes(query) ||
    (item.note ?? "").toLowerCase().includes(query);
  if (options.role !== "manager") {
    const rows = options.expenses
      .filter(matchesSearch)
      .map((item) => ({ type: "expense" as const, item }));
    const total = options.effectiveExpenses
      .filter(matchesSearch)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return { rows, total };
  }

  const salaryExpenses = options.effectiveExpenses.filter((item) => item.category === "salary");
  const salaryAmount = salaryExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const monthLabel = options.filterMonth
    ? `Tháng ${options.filterMonth.slice(5, 7)}/${options.filterMonth.slice(0, 4)}`
    : "Tất cả kỳ";
  const salaryDescription = `Tổng lương giáo viên - ${monthLabel}`;
  const showSalarySummary = salaryExpenses.length > 0 && salaryDescription.toLowerCase().includes(query);

  const rows: ExpenseDisplayRow<T>[] = options.expenses
    .filter((item) => item.category !== "salary" && matchesSearch(item))
    .map((item) => ({ type: "expense" as const, item }));

  if (showSalarySummary) {
    rows.push({
      type: "salary-summary",
      dateLabel: monthLabel,
      branchLabel: options.salaryBranchLabel,
      categoryLabel: "👤 Lương",
      description: salaryDescription,
      amount: salaryAmount,
      statusLabel: "Đã ghi sổ",
    });
  }

  const matchingEffectiveExpenses = options.effectiveExpenses.filter(
    (item) => item.category !== "salary" && matchesSearch(item),
  );
  const total = matchingEffectiveExpenses.reduce((sum, item) => sum + Number(item.amount), 0)
    + (showSalarySummary ? salaryAmount : 0);

  return { rows, total };
}
