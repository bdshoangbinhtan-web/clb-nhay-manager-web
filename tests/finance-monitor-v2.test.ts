import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const monitor = readFileSync(new URL("../app/finance/monitor/page.tsx", import.meta.url), "utf8");
const tuition = readFileSync(new URL("../app/tuition/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261102130000_finance_monitor_v2.sql", import.meta.url), "utf8");

test("finance monitor separates actionable issues, pending closings, and reversal history", () => {
  for (const name of ["Cần kiểm tra", "Chốt quỹ", "Lịch sử điều chỉnh", "get_finance_monitor_v2"]) {
    assert.ok(monitor.includes(name), name);
  }
  assert.match(migration, /issue_type' <> 'unclosed_day'/);
  assert.match(migration, /where e\.issue_type <> 'reversal'/);
  assert.match(migration, /where e\.issue_type='reversal'/);
  assert.match(migration, /pending_closings/);
  assert.match(migration, /not exists \(select 1 from public\.cash_ledger/);
});

test("review statuses are stored separately from immutable ledger", () => {
  assert.match(migration, /create table if not exists public\.finance_monitor_reviews/);
  assert.match(migration, /'unchecked','reviewing','verified','fixed'/);
  assert.match(migration, /coalesce\(public\.is_admin\(\),false\)/);
  assert.match(migration, /alter table public\.finance_monitor_reviews enable row level security/);
  assert.doesNotMatch(migration, /(?:update|delete from) public\.cash_ledger/i);
  assert.match(monitor, /set_finance_monitor_review/);
});

test("monthly tuition exemption is available beside collection in both search layouts", () => {
  assert.doesNotMatch(tuition, /adminDeletePanel/);
  assert.match(tuition, /currentMonthWaiverTarget/);
  assert.match(tuition, /waiversForStudent/);
  assert.match(tuition, /monthLabel\(currentMonth\)/);
  assert.match(tuition, /restoringWaiverId/);
});
