import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260918060000_scale_activity_logs.sql",
    import.meta.url
  ),
  "utf8"
);

const page = readFileSync(
  new URL("../app/activity-log/page.tsx", import.meta.url),
  "utf8"
);

test("activity history uses server-side filters and bounded pagination", () => {
  assert.match(migration, /function public\.get_activity_log_page\(/i);
  assert.match(migration, /p_month date default null/i);
  assert.match(migration, /p_branch_id uuid default null/i);
  assert.match(migration, /p_user_id uuid default null/i);
  assert.match(migration, /p_business_group text default null/i);
  assert.match(migration, /limit v_page_size/i);
  assert.match(migration, /offset \(v_page - 1\) \* v_page_size/i);
  assert.match(page, /Xem thêm/);
  assert.doesNotMatch(page, /\.limit\(100\)/);
});

test("statistics are calculated from the complete filtered set", () => {
  assert.match(migration, /aggregate_stats as \(/i);
  assert.match(migration, /count\(\*\) as total/i);
  assert.match(migration, /count\(\*\) filter \(where action = 'INSERT'\)/i);
  assert.match(migration, /count\(\*\) filter \(where action = 'UPDATE'\)/i);
  assert.match(migration, /count\(\*\) filter \(where action = 'DELETE'\)/i);
  assert.match(page, /stats\.total/);
  assert.doesNotMatch(page, /visibleLogs\.length/);
});

test("financial audit mode includes all important money tables", () => {
  for (const entity of [
    "tuition",
    "tuition_payments",
    "tuition_adjustments",
    "expenses",
    "other_revenues",
    "teacher_payrolls",
    "teacher_payroll_details",
    "teacher_work_sessions",
  ]) {
    assert.match(migration, new RegExp(`'${entity}'`));
  }

  assert.match(migration, /when p_financial_only then[\s\S]*l\.business_group = 'finance'/i);
  assert.match(page, /Kiểm tra tài chính/);
  assert.match(page, /p_financial_only: financialMode/);
});

test("logs are enriched, indexed, retained, and immutable", () => {
  for (const column of [
    "branch_id",
    "business_group",
    "actor_name_snapshot",
    "actor_role_snapshot",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }

  assert.match(migration, /activity_logs_branch_created_idx/i);
  assert.match(migration, /activity_logs_user_created_idx/i);
  assert.match(migration, /activity_logs_group_created_idx/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /for select\s+to authenticated\s+using \(public\.is_admin\(\)\)/i);
  assert.match(migration, /revoke insert, update, delete, truncate/i);
  assert.match(migration, /reject_activity_log_update_delete/i);
  assert.match(migration, /reject_activity_log_truncate/i);
  assert.match(migration, /no automatic retention or purge/i);
  assert.doesNotMatch(migration, /delete from public\.activity_logs/i);
  assert.doesNotMatch(migration, /truncate\s+public\.activity_logs/i);
});
