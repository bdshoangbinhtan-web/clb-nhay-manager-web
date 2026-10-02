import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeTransferAccount } from "../lib/payment-method.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20261002174328_add_transfer_account_classification.sql", import.meta.url),
  "utf8",
);
const tuitionPage = readFileSync(new URL("../app/tuition/page.tsx", import.meta.url), "utf8");
const payrollPage = readFileSync(new URL("../app/teacher-payroll/page.tsx", import.meta.url), "utf8");
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

test("migration backfills only identified transfer source rows and never mutates the append-only ledger", () => {
  for (const table of ["tuition_payments", "expenses", "other_revenues", "teacher_payrolls"]) {
    assert.match(migration, new RegExp(`update public\\.${table} set transfer_account = 'H'[\\s\\S]*?where payment_method = 'transfer' and transfer_account is null`, "i"));
  }
  assert.doesNotMatch(migration, /update\s+public\.cash_ledger/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.cash_ledger/i);
  assert.match(migration, /v_transfer_account not in \('H','A','S','V'\)/);
  assert.match(migration, /if v_method = 'cash' then\s+new\.transfer_account := null/);
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

test("Privacy View opens the shared tuition page and fixes collection to transfer", () => {
  assert.match(appShell, /privacyView && pathname !== "\/tuition" && !pathname\.startsWith\("\/tuition\/receipt\/"\)/);
  assert.match(privacyPage, /href="\/tuition" className="ui-btn ui-btn-blue">Thu học phí/);
  assert.match(tuitionPage, /if \(privacyView\) \{[\s\S]*?Tìm học viên và thu tiền/);
  assert.match(tuitionPage, /setPaymentMethod\(privacyView \? "transfer"/);
  assert.match(tuitionPage, /if \(privacyView\) query = query\.eq\("payment_method", "transfer"\)/);
  assert.match(tuitionPage, /p_transfer_account: normalizeTransferAccount\(paymentMethod, transferAccount\)/);
});
