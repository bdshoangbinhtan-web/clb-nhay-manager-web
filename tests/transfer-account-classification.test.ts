import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeTransferAccount } from "../lib/payment-method.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20261002191833_add_transfer_account_classification.sql", import.meta.url),
  "utf8",
);
const enforcementMigration = readFileSync(
  new URL("../supabase/migrations/20261002193914_enforce_transfer_account_selection.sql", import.meta.url),
  "utf8",
);
const tuitionPage = readFileSync(new URL("../app/tuition/page.tsx", import.meta.url), "utf8");
const payrollPage = readFileSync(new URL("../app/teacher-payroll/page.tsx", import.meta.url), "utf8");
const financePage = readFileSync(new URL("../app/finance/page.tsx", import.meta.url), "utf8");
const reportsPage = readFileSync(new URL("../app/reports/page.tsx", import.meta.url), "utf8");
const expensesPage = readFileSync(new URL("../app/expenses/page.tsx", import.meta.url), "utf8");
const revenuesPage = readFileSync(new URL("../app/other-revenue/page.tsx", import.meta.url), "utf8");
const privacyPage = readFileSync(new URL("../components/layout/privacy-workspace.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../components/layout/app-shell.tsx", import.meta.url), "utf8");
const payrollMigration = readFileSync(new URL("../supabase/migrations/20261001135049_fix_teacher_payroll_payment_and_expense_period.sql", import.meta.url), "utf8");

test("cash has no transfer account and transfer accepts only H/A/S/V", () => {
  assert.equal(normalizeTransferAccount("cash", null), null);
  for (const account of ["H", "A", "S", "V"]) {
    assert.equal(normalizeTransferAccount("transfer", account), account);
  }
  assert.throws(() => normalizeTransferAccount("transfer", null));
  assert.throws(() => normalizeTransferAccount("transfer", "X"));
});

test("phase one never updates historical sources or the append-only ledger", () => {
  assert.doesNotMatch(migration, /update\s+public\.(tuition_payments|expenses|other_revenues|teacher_payrolls)\b/i);
  assert.doesNotMatch(migration, /update\s+public\.cash_ledger/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.cash_ledger/i);
  assert.match(migration, /v_transfer_account not in \('H','A','S','V'\)/);
  assert.match(migration, /if v_method = 'cash' then\s+new\.transfer_account := null/);
  for (const table of ["tuition_payments", "expenses", "other_revenues", "teacher_payrolls"]) {
    assert.match(migration, new RegExp(`check \\(transfer_account is null or \\(payment_method = 'transfer' and transfer_account in \\('H','A','S','V'\\)\\) is true\\) not valid`, "i"));
    assert.match(migration, new RegExp(`validate constraint ${table}_transfer_account_check`, "i"));
  }
  assert.match(migration, /coalesce\(v_transfer_account, v_requested_account, 'H'\)/);
  assert.match(enforcementMigration, /coalesce\(v_transfer_account, v_requested_account\)/);
  assert.match(enforcementMigration, /if v_transfer_account is null or v_transfer_account not in \('H','A','S','V'\) then/);
  assert.doesNotMatch(enforcementMigration, /coalesce\(v_transfer_account, v_requested_account, 'H'\)/);
});

test("new source triggers preserve one ledger row and add classification only to transfer metadata", () => {
  for (const trigger of ["finance_post_tuition_payment", "finance_post_expense", "finance_post_other_revenue"]) {
    const start = migration.indexOf(`function private.${trigger}`);
    assert.notEqual(start, -1, `${trigger} must be replaced in the migration`);
    const nextFunction = migration.indexOf("create or replace function", start + 10);
    const body = migration.slice(start, nextFunction < 0 ? undefined : nextFunction);
    assert.match(body, /transfer_account/);
    assert.match(body, /private\.finance_insert_ledger/);
  }
  assert.doesNotMatch(migration, /alter\s+table\s+public\.cash_ledger/i);
  assert.match(migration, /create or replace function public\.collect_tuition_payment_idempotent_atomic/);
  assert.match(tuitionPage, /collectionRequestIdRef\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(tuitionPage, /p_transfer_account: normalizeTransferAccount/);
});

test("payroll carries the selected account to both payroll and generated expense rows", () => {
  assert.match(payrollPage, /p_transfer_account: transferAccount/);
  assert.match(migration, /set_config\('finance\.transfer_account'/);
  assert.match(migration, /finance_set_transfer_account before insert or update of payment_method, transfer_account on public\.teacher_payrolls/);
  assert.match(migration, /finance_set_transfer_account before insert or update of payment_method, transfer_account on public\.expenses/);
  assert.match(payrollMigration, /already_paid/);
  assert.match(payrollMigration, /allowance/);
});

test("legacy transfers without an account are read as H in reports, finance, payroll and edit forms", () => {
  assert.match(financePage, /value === "A" \|\| value === "S" \|\| value === "V" \? value : "H"/);
  assert.match(reportsPage, /item\.transfer_account \?\? "H"/);
  assert.match(payrollPage, /payroll\.transfer_account \?\? "H"/);
  assert.match(expensesPage, /item\.transfer_account \?\? "H"/);
  assert.match(revenuesPage, /r\.transfer_account\?\?'H'/);
  assert.match(privacyPage, /summarizeTransferAccounts\(visibleFinanceTransactions\)/);
});

test("tuition collection requires an explicit final confirmation before writing", () => {
  const paymentFields = readFileSync(new URL("../components/payment-method-fields.tsx", import.meta.url), "utf8");
  assert.match(tuitionPage, /useState<PaymentMethod \| "">\(""/);
  assert.match(paymentFields, /<option value="" disabled>Chọn phương thức<\/option>/);
  assert.match(tuitionPage, /if \(!paymentMethod\)/);
  assert.match(tuitionPage, /Chỉ bấm OK khi đã nhận tiền thực tế/);
  assert.match(tuitionPage, /method \?\? ""/);
  assert.match(tuitionPage, /setPaymentMethod\(privacyView \? "transfer" : ""\)/);
  assert.doesNotMatch(tuitionPage, /amountToCollectInputRef\.current\?\.focus/);
});

test("Privacy View opens the shared tuition page and fixes collection to transfer", () => {
  assert.match(appShell, /privacyView && pathname !== "\/tuition" && !pathname\.startsWith\("\/tuition\/receipt\/"\)/);
  assert.match(privacyPage, /href="\/tuition" className="ui-btn ui-btn-blue">Thu học phí/);
  assert.match(tuitionPage, /if \(privacyView\) \{[\s\S]*?Tìm học viên và thu tiền/);
  assert.match(tuitionPage, /setPaymentMethod\(privacyView \? "transfer"/);
  assert.match(tuitionPage, /if \(privacyView\) query = query\.eq\("payment_method", "transfer"\)/);
  assert.match(tuitionPage, /p_transfer_account: normalizeTransferAccount\(paymentMethod, transferAccount\)/);
});
