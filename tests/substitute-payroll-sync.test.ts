import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260917160000_fix_substitute_payroll_attendance.sql", import.meta.url),
  "utf8"
);

test("work session dạy thay tự ghi attendance đã dạy", () => {
  assert.match(migration, /after insert on public\.teacher_work_sessions/);
  assert.match(migration, /new\.teaching_type = 'substitute'/);
  assert.match(migration, /r\.id = new\.substitution_request_id/);
  assert.match(migration, /r\.status = 'approved'/);
  assert.match(migration, /new\.actual_teacher_id[\s\S]*'taught'/);
});

test("patch không thay đổi trường hoặc công thức lương theo lớp", () => {
  assert.doesNotMatch(migration, /teacher_salary_per_session/);
  assert.doesNotMatch(migration, /class_salary_per_session_snapshot/);
  assert.doesNotMatch(migration, /calculated_amount/);
  assert.doesNotMatch(migration, /duration_multiplier/);
});

test("backfill chỉ nhận request approved và giữ nguyên kỳ đã khóa", () => {
  assert.match(migration, /r\.id = ws\.substitution_request_id/);
  assert.match(migration, /r\.substitute_teacher_id = ws\.actual_teacher_id/);
  assert.match(migration, /r\.status = 'approved'/);
  assert.match(migration, /p\.status in \('locked', 'paid'\)/);
  assert.match(migration, /not exists \([\s\S]*from public\.teacher_attendance/);
  assert.match(migration, /on conflict .* do nothing/);
});
