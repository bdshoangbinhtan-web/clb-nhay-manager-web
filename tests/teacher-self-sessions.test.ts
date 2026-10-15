import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261015230000_teacher_sessions_independent_of_payroll.sql", import.meta.url),
  "utf8"
);
const teacherPage = readFileSync(new URL("../app/teachers/page.tsx", import.meta.url), "utf8");
const salaryPage = readFileSync(new URL("../app/teacher-salary/page.tsx", import.meta.url), "utf8");
const payrollPage = readFileSync(new URL("../app/teacher-payroll/page.tsx", import.meta.url), "utf8");

test("teacher can read only own taught sessions independently from payroll", () => {
  const view = migration.split("create or replace function public.get_my_teacher_salary")[0];
  assert.match(view, /security definer[\s\S]*?set search_path to ''/i);
  assert.match(view, /ta\.teacher_id = t\.id[\s\S]*?ta\.status = 'taught'/i);
  assert.match(view, /t\.profile_id = \(select auth\.uid\(\)\)/i);
  assert.match(view, /date_trunc\('month', p_month\)/i);
  assert.match(view, /revoke all on function public\.get_my_teacher_sessions\(date\) from public, anon/i);
  assert.doesNotMatch(view, /public\.teacher_payrolls/i);
});

test("draft payroll cannot return money even through RPC", () => {
  const moneyFields = ["p.total_amount","d.salary_rate","d.duration_multiplier","d.calculated_amount","d.amount","d.amount_override"];
  for (const field of moneyFields) {
    assert.match(migration, new RegExp("case when p.status in \\('locked','paid'\\) then " + field.replace(".", "\\.")));
  }
});

test("teacher screen counts attendance and hides money before lock", () => {
  assert.match(salaryPage, /rpc\("get_my_teacher_sessions"/);
  assert.match(salaryPage, /\{sessions\.length\}/);
  assert.match(salaryPage, /\{isLocked && \(/);
  assert.doesNotMatch(salaryPage, /money\(Number\(row\.salary_rate/);
});

test("teacher editor contains no per-teacher salary controls", () => {
  assert.doesNotMatch(teacherPage, /salaryRate|salaryLabel|Kiểu tính lương|Mức lương \/ thù lao/);
  assert.match(teacherPage, /Lương theo lớp/);
  assert.doesNotMatch(payrollPage, /teacher\.salary_rate/);
});
