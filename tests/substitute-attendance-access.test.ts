import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260917150000_fix_substitute_teacher_student_attendance.sql",
    import.meta.url
  ),
  "utf8"
);

const page = readFileSync(
  new URL("../app/teacher-student-attendance/page.tsx", import.meta.url),
  "utf8"
);

test("quyền dạy thay bị giới hạn đúng giáo viên, lớp, ngày và trạng thái approved", () => {
  assert.match(migration, /r\.class_id = p_class_id/);
  assert.match(migration, /r\.session_date = p_attendance_date/);
  assert.match(migration, /r\.substitute_teacher_id = t\.id/);
  assert.match(migration, /r\.status = 'approved'/);
});

test("giữ nguyên khóa giáo viên đứng lớp khi đã duyệt người dạy thay", () => {
  assert.match(migration, /and not exists \(/);
  assert.match(migration, /r\.standing_teacher_id = t\.id/);
  assert.match(migration, /r\.session_date = p_attendance_date/);
});

test("không cấp quyền lớp hoặc học viên vĩnh viễn cho giáo viên dạy thay", () => {
  assert.doesNotMatch(
    migration,
    /create or replace function private\.teacher_can_access_class\s*\(/
  );
  assert.doesNotMatch(
    migration,
    /create or replace function private\.teacher_can_access_student\s*\(/
  );
  assert.doesNotMatch(migration, /create policy/i);
});

test("RPC đọc và lưu đều kiểm tra cùng quyền lớp theo ngày", () => {
  const checks = migration.match(
    /private\.teacher_can_access_class_on_date\s*\(/g
  );
  assert.ok(checks && checks.length >= 3);
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test("RPC lưu chỉ nhận học viên active thuộc đúng lớp", () => {
  assert.match(migration, /cs\.class_id = p_class_id/);
  assert.match(migration, /cs\.student_id = input\.student_id/);
  assert.match(migration, /cs\.status = 'active'/);
  assert.match(migration, /s\.status = 'active'/);
  assert.match(migration, /on conflict \(student_id, class_id, attendance_date\)/);
});

test("màn hình giáo viên không còn đọc trực tiếp roster và attendance", () => {
  assert.match(page, /get_teacher_student_attendance_roster_v2/);
  assert.match(page, /save_teacher_student_attendance/);
  assert.doesNotMatch(page, /\.from\("class_students"\)/);
  assert.doesNotMatch(page, /\.from\("attendance"\)/);
  assert.match(page, /name: item\.class_name/);
});
