import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261001135049_fix_teacher_payroll_payment_and_expense_period.sql",
    import.meta.url
  ),
  "utf8"
);

test("payroll save and payment RPCs remain executable only by authenticated", () => {
  assert.match(migration, /revoke all on function public\.save_teacher_payroll_with_meta_atomic[\s\S]*?from public, anon/i);
  assert.match(migration, /grant execute on function public\.save_teacher_payroll_with_meta_atomic[\s\S]*?to authenticated/i);
  assert.match(migration, /create or replace function public\.pay_teacher_payroll_with_allowance[\s\S]*?revoke all on function public\.pay_teacher_payroll_with_allowance[\s\S]*?from public, anon[\s\S]*?grant execute on function public\.pay_teacher_payroll_with_allowance[\s\S]*?to authenticated/i);
  assert.match(migration, /security definer[\s\S]*?set search_path to ''/i);
});

test("salary and allowance expenses store payment method and payroll month directly", () => {
  const payRpc = migration.split("create or replace function private.finance_post_expense")[0];
  assert.equal((payRpc.match(/insert into public\.expenses\s*\([\s\S]*?payment_method, note\s*\)[\s\S]*?v_payroll\.payroll_month/g) ?? []).length, 2);
  assert.match(payRpc, /if v_payroll\.status = 'paid'[\s\S]*?already_paid/);
  assert.match(payRpc, /set status = 'paid',[\s\S]*?paid_at = now\(\)/);
});

test("ledger date is actual local payment date for verified payroll expenses only", () => {
  const trigger = migration.slice(migration.indexOf("create or replace function private.finance_post_expense"));
  assert.match(trigger, /coalesce\(new\.payment_method, ''\)/);
  assert.match(trigger, /lower\(nullif\(btrim\(coalesce\(new\.payment_method, ''\)\), ''\)\)/);
  assert.match(trigger, /p\.id::text/);
  assert.match(trigger, /clock_timestamp\(\) at time zone 'Asia\/Ho_Chi_Minh'/);
  assert.match(trigger, /else new\.expense_date/);
  assert.doesNotMatch(trigger, /drop trigger/i);
});

test("period correction guard permits only payroll expense_date with all other fields unchanged", () => {
  const guard = readFileSync(
    new URL(
      "../supabase/migrations/20261001135341_allow_payroll_expense_period_correction.sql",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(guard, /to_jsonb\(new\) - 'expense_date'[\s\S]*?to_jsonb\(old\) - 'expense_date'/);
  assert.match(guard, /new\.expense_date = p\.payroll_month/);
  assert.match(guard, /Tự động từ bảng lương #/);
  assert.match(guard, /Chi lương giáo viên - %/);
  assert.match(guard, /Phụ cấp giáo viên - %/);
  assert.match(guard, /source_type = v_type and l\.source_id = v_id/);
});
