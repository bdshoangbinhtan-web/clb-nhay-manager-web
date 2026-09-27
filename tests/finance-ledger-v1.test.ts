import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  accountBalances,
  businessDateFromTimestamp,
  filterEffectiveSources,
  summarizeLedger,
  type LedgerEntry,
} from "../lib/finance/ledger.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260927100000_finance_ledger_v1.sql", import.meta.url),
  "utf8",
);

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "entry-1",
    occurred_at: "2026-09-27T16:59:00.000Z",
    business_date: "2026-09-27",
    account_id: "cash",
    direction: "in",
    amount: 300_000,
    category: "tuition",
    description: "Thu học phí",
    branch_id: "branch-1",
    source_type: "tuition_payment",
    source_id: "payment-1",
    created_by_name: "Quản lý",
    reversal_of: null,
    metadata: {},
    ...overrides,
  };
}

test("business date follows Asia/Ho_Chi_Minh at both sides of midnight", () => {
  assert.equal(businessDateFromTimestamp("2026-09-27T16:59:00.000Z"), "2026-09-27");
  assert.equal(businessDateFromTimestamp("2026-09-27T17:01:00.000Z"), "2026-09-28");
});

test("daily totals exclude paired transfers and keep reversal count visible", () => {
  const summary = summarizeLedger([
    entry(),
    entry({ id: "expense", direction: "out", amount: 120_000, category: "utilities", source_type: "expense" }),
    entry({ id: "transfer-out", direction: "out", amount: 50_000, source_type: "account_transfer", category: "transfer" }),
    entry({ id: "transfer-in", direction: "in", amount: 50_000, source_type: "account_transfer", category: "transfer" }),
    entry({ id: "reversal", direction: "out", amount: 20_000, source_type: "reversal", reversal_of: "entry-1" }),
  ]);

  assert.deepEqual(summary, {
    income: 0,
    expense: 120_000,
    net: -120_000,
    transactions: 1,
    adjustments: 1,
  });
});

test("account balances include both sides of transfers", () => {
  const balances = accountBalances([
    entry(),
    entry({ id: "out", direction: "out", amount: 50_000, source_type: "account_transfer" }),
    entry({ id: "in", account_id: "bank", direction: "in", amount: 50_000, source_type: "account_transfer" }),
  ]);
  assert.equal(balances.get("cash"), 250_000);
  assert.equal(balances.get("bank"), 50_000);
});

test("paired transfer reversals restore both account balances without operating income or expense", () => {
  const entries = [
    entry({ id: "transfer-out", account_id: "cash", direction: "out", amount: 75_000, source_type: "account_transfer", source_id: "transfer-1", business_date: "2026-09-26" }),
    entry({ id: "transfer-in", account_id: "bank", direction: "in", amount: 75_000, source_type: "account_transfer", source_id: "transfer-1", business_date: "2026-09-26" }),
    entry({ id: "transfer-out-reversal", account_id: "cash", direction: "in", amount: 75_000, source_type: "reversal", reversal_of: "transfer-out", business_date: "2026-09-26", created_at: "2026-09-27T01:00:00.000Z" }),
    entry({ id: "transfer-in-reversal", account_id: "bank", direction: "out", amount: 75_000, source_type: "reversal", reversal_of: "transfer-in", business_date: "2026-09-26", created_at: "2026-09-27T01:00:00.000Z" }),
  ];
  assert.ok(entries.every((item) => item.business_date === "2026-09-26"));
  assert.deepEqual([...accountBalances(entries)], [["cash", 0], ["bank", 0]]);
  assert.deepEqual(summarizeLedger(entries), { income: 0, expense: 0, net: 0, transactions: 0, adjustments: 2 });
});

test("expense correction keeps its historical business date while retaining the later creation time", () => {
  const original = entry({
    id: "expense-wrong", direction: "out", amount: 500_000, source_type: "expense",
    business_date: "2026-09-26", occurred_at: "2026-09-26T08:00:00.000Z", created_at: "2026-09-26T08:00:00.000Z",
  });
  const closingAt = "2026-09-26T09:00:00.000Z";
  const reversal = entry({
    id: "expense-correction", direction: "in", amount: 500_000, source_type: "reversal",
    business_date: original.business_date, reversal_of: original.id,
    occurred_at: "2026-09-27T02:00:00.000Z", created_at: "2026-09-27T02:00:00.000Z",
  });
  const historicalEntries = [original, reversal].filter((item) => item.business_date <= "2026-09-26");
  assert.equal(summarizeLedger(historicalEntries).expense, 0);
  assert.equal(accountBalances(historicalEntries).get("cash"), 0);
  assert.ok(Date.parse(reversal.created_at!) > Date.parse(closingAt));
  assert.ok(Date.parse(reversal.occurred_at) > Date.parse(original.occurred_at));
  const reversalFunction = migration.match(/create or replace function private\.finance_insert_reversal[\s\S]*?\$function\$;/)?.[0] ?? "";
  assert.match(reversalFunction, /now\(\),now\(\),p_original\.business_date/);
});

test("opening balance affects account balance but never operating income", () => {
  const opening = entry({
    id: "opening",
    amount: 10_000_000,
    source_type: "opening_balance",
    source_id: "opening-1",
    category: "opening_balance",
  });
  assert.equal(summarizeLedger([opening]).income, 0);
  assert.equal(accountBalances([opening]).get("cash"), 10_000_000);
});

test("opening balance correction restores the historical balance on the original business date", () => {
  const opening = entry({ id: "opening", amount: 10_000_000, source_type: "opening_balance", business_date: "2026-09-26" });
  const reversal = entry({ id: "opening-reversal", direction: "out", amount: 10_000_000, source_type: "reversal", reversal_of: opening.id, business_date: opening.business_date, created_at: "2026-09-27T02:00:00.000Z" });
  const historicalEntries = [opening, reversal].filter((item) => item.business_date <= "2026-09-26");
  assert.equal(accountBalances(historicalEntries).get("cash"), 0);
  assert.equal(summarizeLedger(historicalEntries).income, 0);
});

test("expense and other-revenue corrections reconcile effective source totals to ledger totals", () => {
  const expenseSource = [
    { id: "expense-old", amount: 300_000 },
    { id: "expense-corrected", amount: 250_000 },
  ];
  const revenueSource = [
    { id: "revenue-old", amount: 400_000 },
    { id: "revenue-corrected", amount: 450_000 },
  ];
  const ledger = [
    entry({ id: "expense-old-ledger", direction: "out", amount: 300_000, source_type: "expense", source_id: "expense-old", is_reversed_source: true }),
    entry({ id: "expense-reversal", direction: "in", amount: 300_000, source_type: "reversal", reversal_of: "expense-old-ledger" }),
    entry({ id: "expense-correct-ledger", direction: "out", amount: 250_000, source_type: "expense", source_id: "expense-corrected" }),
    entry({ id: "revenue-old-ledger", amount: 400_000, source_type: "other_revenue", source_id: "revenue-old", is_reversed_source: true }),
    entry({ id: "revenue-reversal", direction: "out", amount: 400_000, source_type: "reversal", reversal_of: "revenue-old-ledger" }),
    entry({ id: "revenue-correct-ledger", amount: 450_000, source_type: "other_revenue", source_id: "revenue-corrected" }),
  ];
  const reversals = [
    { source_type: "expense", source_id: "expense-old" },
    { source_type: "other_revenue", source_id: "revenue-old" },
  ];
  const effectiveExpenses = filterEffectiveSources("expense", expenseSource, reversals).reduce((sum, source) => sum + source.amount, 0);
  const effectiveRevenue = filterEffectiveSources("other_revenue", revenueSource, reversals).reduce((sum, source) => sum + source.amount, 0);
  const ledgerTotals = summarizeLedger(ledger);
  assert.equal(ledgerTotals.expense, effectiveExpenses);
  assert.equal(ledgerTotals.income, effectiveRevenue);
});

test("tuition correction remains a refund source plus a replacement payment", () => {
  const migrationHasSafePolicy = /source_type in \('tuition_payment','tuition_refund'\)[\s\S]*?Không đảo ledger riêng cho học phí/.test(migration);
  assert.equal(migrationHasSafePolicy, true);
  const ledger = [
    entry({ id: "payment-old", amount: 300_000 }),
    entry({ id: "refund", direction: "out", amount: 300_000, source_type: "tuition_refund", source_id: "refund-batch" }),
    entry({ id: "payment-corrected", amount: 250_000, source_id: "payment-corrected" }),
  ];
  const totals = summarizeLedger(ledger);
  assert.equal(totals.income, 550_000);
  assert.equal(totals.expense, 300_000);
  assert.equal(totals.net, 250_000);
});

test("generic ledger reversal refuses transfers, tuition, and opening balances; transfer RPC reverses both sides", () => {
  assert.match(migration, /if v_original\.source_type='account_transfer' then[\s\S]*Không thể đảo một phía/i);
  assert.match(migration, /v_original\.source_type in \('tuition_payment','tuition_refund'\)/i);
  assert.match(migration, /v_original\.source_type='opening_balance' then[\s\S]*thao tác chuyên biệt/i);
  assert.match(migration, /reverse_cash_transfer\(p_transfer_id uuid[\s\S]*array\[\(v_originals\[1\]\)\.id,\(v_originals\[2\]\)\.id\]/i);
});

test("tuition, expense and other revenue inserts all post through transactional triggers", () => {
  assert.match(migration, /create trigger finance_post_tuition_payment after insert on public\.tuition_payments/i);
  assert.match(migration, /create trigger finance_post_expense after insert on public\.expenses/i);
  assert.match(migration, /create trigger finance_post_other_revenue after insert on public\.other_revenues/i);
  assert.match(migration, /create unique index cash_ledger_source_account_key[\s\S]*\(source_type, source_id, account_id\)/i);
});

test("tuition refunds require a stable batch, payment method and a paired ledger entry", () => {
  const studentPage = readFileSync(
    new URL("../app/students/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create trigger finance_post_tuition_refund_batch after insert on public\.tuition_adjustments/i);
  assert.match(migration, /source_type='tuition_refund'/i);
  assert.match(migration, /refund_payment_method not in \('cash','transfer'\)/i);
  assert.match(migration, /source_type in \('tuition_payment','tuition_refund'/i);
  assert.match(studentPage, /refund_batch_id: refundBatchId/);
  assert.match(studentPage, /setRefundPaymentMethod/);
  assert.match(studentPage, /priorLedger/);
  assert.match(migration, /refund_amount_mismatch/);
});

test("cash ledger and closing history reject update, delete and truncate", () => {
  for (const table of ["public.cash_ledger", "public.finance_source_reversals", "public.daily_cash_closings", "public.cash_account_openings"]) {
    assert.ok(migration.includes(`before update or delete on ${table}`));
    assert.ok(migration.includes(`before truncate on ${table}`));
  }
  assert.match(migration, /reversal_of uuid references public\.cash_ledger\(id\)/i);
  assert.match(migration, /case p_original\.direction when 'in' then 'out' else 'in' end/i);
});

test("source primary-key mutation checks OLD.id and legacy sources cannot be shifted into live periods", () => {
  assert.match(migration, /v_id uuid := old\.id/i);
  assert.match(migration, /new\.id is distinct from old\.id[\s\S]*cash_ledger l where l\.source_type=v_type and l\.source_id=old\.id/i);
  assert.match(migration, /old\.created_at < v_go_live[\s\S]*Dữ liệu tài chính trước ngày mở sổ/i);
  assert.match(migration, /finance_source_reversals/);
});

test("reversed expense and other revenue totals are excluded on source, report and dashboard pages", () => {
  const expensePage = readFileSync(new URL("../app/expenses/page.tsx", import.meta.url), "utf8");
  const revenuePage = readFileSync(new URL("../app/other-revenue/page.tsx", import.meta.url), "utf8");
  const reportsPage = readFileSync(new URL("../app/reports/page.tsx", import.meta.url), "utf8");
  const dashboardPage = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  for (const source of [expensePage, revenuePage, reportsPage, dashboardPage]) {
    assert.match(source, /finance_source_reversals/);
    assert.match(source, /filterEffectiveSources/);
  }
  assert.match(expensePage, /Đã đảo · không tính vào tổng/);
  assert.match(revenuePage, /Đã đảo · không tính vào tổng/);
});

test("zero opening is rejected and a corrected positive opening is allowed after reversal", () => {
  assert.match(migration, /p_balance <= 0[\s\S]*must be greater than 0|p_balance <= 0[\s\S]*lớn hơn 0/i);
  assert.match(migration, /record_cash_opening_balance[\s\S]*p_balance > 0/i);
  assert.match(migration, /not exists \(select 1 from public\.finance_source_reversals r where r\.source_type='opening_balance'/i);
});

test("production history is untouched and old transactions are outside the audit window", () => {
  assert.doesNotMatch(migration, /\btruncate\s+(table\s+)?(public\.)?(tuition|tuition_payments|expenses|other_revenues)\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.(tuition|tuition_payments|expenses|other_revenues)\b/i);
  assert.doesNotMatch(migration, /\binsert\s+into\s+public\.cash_ledger\s*\([^)]*\)\s*select/i);
  assert.match(migration, /ledger_go_live_at timestamptz not null default now\(\)/i);
  assert.match(migration, /tp\.created_at>=v_start/i);
  assert.match(migration, /e\.created_at>=v_start/i);
  assert.match(migration, /r\.created_at>=v_start/i);
});

test("monitoring RPC is admin-only and checks missing/mismatched ledger references", () => {
  assert.match(migration, /if v_role <> 'admin' or not coalesce\(v_active,false\)/i);
  assert.match(migration, /'missing_ledger'/i);
  assert.match(migration, /'payment_amount_mismatch'/i);
  assert.match(migration, /'orphan_ledger'/i);
  assert.match(migration, /'unclosed_day'/i);
});

test("daily closing is branch-only and finance audit warns only for prior days on active branches", () => {
  const closeFunction = migration.match(/create or replace function public\.close_daily_cash[\s\S]*?\$function\$;/)?.[0] ?? "";
  const auditFunction = migration.match(/create or replace function public\.get_finance_audit[\s\S]*?\$function\$;/)?.[0] ?? "";
  const financePage = readFileSync(new URL("../app/finance/page.tsx", import.meta.url), "utf8");
  assert.match(closeFunction, /if p_branch_id is null then/);
  assert.match(closeFunction, /finance_require_actor\(p_branch_id, false\)/);
  assert.match(closeFunction, /branches b where b\.id=p_branch_id and b\.status::text='active'/);
  assert.match(auditFunction, /least\(v_to,\(now\(\) at time zone 'Asia\/Ho_Chi_Minh'\)::date - 1\)/);
  assert.match(auditFunction, /select b\.id branch_id from public\.branches b where b\.status::text='active'/);
  assert.doesNotMatch(auditFunction, /select null::uuid branch_id union all/);
  assert.match(financePage, /Chọn CS1 hoặc CS2 để chốt quỹ\./);
  assert.match(financePage, /<fieldset disabled=\{saving \|\| !activeBranchId\}/);
});
