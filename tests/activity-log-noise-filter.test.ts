import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260927160000_declutter_activity_history.sql", import.meta.url),
  "utf8"
);

const page = readFileSync(
  new URL("../app/activity-log/page.tsx", import.meta.url),
  "utf8"
);

test("admin activity history hides student attendance without deleting audit data", () => {
  assert.match(migration, /l\.entity_type\s*<>\s*'attendance'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.activity_logs/i);
  assert.doesNotMatch(migration, /truncate\s+public\.activity_logs/i);
  assert.doesNotMatch(page, /attendance:\s*"Điểm danh học viên"/);
  assert.match(page, /teacher_attendance:\s*"Điểm danh giáo viên"/);
});

test("admin activity history hides technical-only updated_at updates", () => {
  assert.match(migration, /l\.action\s*=\s*'UPDATE'/i);
  assert.match(migration, /coalesce\(l\.old_data, '\{\}'::jsonb\) - 'updated_at'/i);
  assert.match(migration, /coalesce\(l\.new_data, '\{\}'::jsonb\) - 'updated_at'/i);
});

test("classes group no longer advertises student attendance", () => {
  assert.match(page, /classes:\s*\{ label: "Lớp học"/);
  assert.doesNotMatch(page, /Lớp & điểm danh/);
});
