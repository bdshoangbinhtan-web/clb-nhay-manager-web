import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260918190000_create_system_integrity_checker.sql",
    import.meta.url
  ),
  "utf8"
);

const page = readFileSync(
  new URL("../app/system-integrity/page.tsx", import.meta.url),
  "utf8"
);

const middleware = readFileSync(
  new URL("../middleware.ts", import.meta.url),
  "utf8"
);

const sidebar = readFileSync(
  new URL("../components/layout/sidebar.tsx", import.meta.url),
  "utf8"
);

test("integrity data model persists runs and deduplicated issue lifecycle", () => {
  assert.match(migration, /create table if not exists public\.integrity_check_runs/i);
  assert.match(migration, /create table if not exists public\.integrity_issues/i);
  assert.match(migration, /fingerprint text not null/i);
  assert.match(migration, /unique index if not exists integrity_issues_fingerprint_unique/i);
  assert.match(migration, /status in \('open', 'resolved'\)/i);
  assert.match(migration, /on conflict \(fingerprint\) do update/i);
  assert.match(migration, /occurrence_count = public\.integrity_issues\.occurrence_count \+ 1/i);
});

test("runner implements the ten audited checks without business auto-fix", () => {
  for (const key of [
    "CS001_DUPLICATE_CLASS_SESSION",
    "TW001_TAUGHT_WITHOUT_WORK_SESSION",
    "TW002_WORK_SESSION_LINK_INVALID",
    "SUB001_SUBSTITUTE_WITHOUT_APPROVED_REQUEST",
    "SUB002_SUBSTITUTE_IDENTITY_MISMATCH",
    "TW003_DUPLICATE_WORK_SESSION",
    "SAL001_EFFECTIVE_SALARY_INVALID",
    "TUI001_TUITION_OVERPAID",
    "TUI002_PAYMENT_TOTAL_MISMATCH",
    "PAY001_PAYROLL_TOTAL_MISMATCH",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }

  const runnerStart = migration.indexOf(
    "create or replace function public.run_system_integrity_checks()"
  );
  const runnerEnd = migration.indexOf(
    "create or replace function public.get_system_integrity_dashboard(",
    runnerStart
  );
  const runner = migration.slice(runnerStart, runnerEnd);

  for (const table of [
    "class_sessions",
    "teacher_attendance",
    "teacher_work_sessions",
    "teacher_substitution_requests",
    "teacher_payrolls",
    "teacher_payroll_details",
    "tuition",
    "tuition_payments",
  ]) {
    assert.doesNotMatch(
      runner,
      new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${table}\\b`, "i")
    );
  }
});

test("failed runs cannot resolve old issues", () => {
  const resolvePosition = migration.indexOf(
    "update public.integrity_issues\n    set\n      status = 'resolved'"
  );
  const exceptionPosition = migration.indexOf(
    "exception\n    when others then",
    resolvePosition
  );

  assert.ok(resolvePosition > 0);
  assert.ok(exceptionPosition > resolvePosition);
  assert.match(migration, /last_seen_run_id is distinct from v_run_id/i);
  assert.match(migration, /status = 'failed'/i);
  assert.match(migration, /error_message = sqlerrm/i);
});

test("database and application restrict the checker to Admin", () => {
  assert.match(migration, /if not public\.is_admin\(\) then/i);
  assert.match(migration, /for select\s+to authenticated\s+using \(public\.is_admin\(\)\)/i);
  assert.match(migration, /revoke all on public\.integrity_check_runs from anon, authenticated/i);
  assert.match(migration, /revoke all on public\.integrity_issues from anon, authenticated/i);
  assert.match(middleware, /const ADMIN_ONLY_ROUTES = \["\/activity-log", "\/system-integrity"\]/);
  assert.match(sidebar, /role === "admin"[\s\S]*href="\/system-integrity"/);
  assert.match(page, /profile\?\.role !== "admin"/);
});

test("UI provides summary, filters, history, pagination and issue details", () => {
  for (const label of [
    "PASS",
    "WARNING",
    "ERROR",
    "CRITICAL",
    "Chạy kiểm tra ngay",
    "Danh sách vấn đề",
    "Lịch sử kiểm tra",
    "Xem chi tiết",
    "Xem dữ liệu kỹ thuật",
    "Xem thêm",
  ]) {
    assert.match(page, new RegExp(label));
  }

  assert.match(page, /p_issue_status: statusFilter/);
  assert.match(page, /p_severity:/);
  assert.match(page, /p_category:/);
  assert.match(page, /run_system_integrity_checks/);
  assert.match(page, /get_system_integrity_dashboard/);
});
