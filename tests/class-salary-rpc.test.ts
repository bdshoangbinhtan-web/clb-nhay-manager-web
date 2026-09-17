import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260917060000_allow_any_valid_class_schedule_for_salary.sql",
    import.meta.url
  ),
  "utf8"
);

function functionBody(name: string) {
  const start = migration.indexOf(`function public.${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);

  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

test("không RPC nào còn chặn lớp khác 2 hoặc 3 buổi", () => {
  for (const name of [
    "confirm_teacher_work_session",
    "create_teacher_work_session",
    "sync_teacher_attendance_to_work_session",
  ]) {
    const body = functionBody(name);
    assert.doesNotMatch(body, /v_day_count\s*=\s*3/);
    assert.doesNotMatch(body, /2 hoặc 3 buổi\/tuần/);
    assert.match(body, /v_day_count < 1/);
  }
});

test("lớp 1, 2 và 3 buổi đều đi qua cùng policy lịch hợp lệ", () => {
  assert.match(migration, /class_schedule_day_count/);
  assert.doesNotMatch(migration, /when v_day_count = 2 then 1\.5/);
  assert.match(migration, /v_multiplier := 1/);
  assert.doesNotMatch(migration, /else\s+raise exception\s+'Lịch lớp phải có 2/);
});

test("dạy thay tạo buổi mới bằng snapshot lương lớp", () => {
  const body = functionBody("create_teacher_work_session");
  assert.match(body, /v_is_substitute/);
  assert.match(body, /r\.status = 'approved'/);
  assert.match(body, /v_class_salary/);
  assert.doesNotMatch(body, /v_rate\s*\*\s*v_multiplier/);
});

test("admin chấm bù tạo buổi mới bằng lương lớp và không ghi đè lương lịch sử", () => {
  const body = functionBody("sync_teacher_attendance_to_work_session");
  const updateBlock = body.slice(
    body.indexOf("update public.teacher_work_sessions"),
    body.indexOf("if found then")
  );

  assert.doesNotMatch(updateBlock, /calculated_amount/);
  assert.doesNotMatch(updateBlock, /duration_multiplier/);
  assert.match(body, /v_class_salary/);
  assert.match(body, /p_status = 'absent'/);
});

test("mọi đường tạo buổi mới đều dùng lương lớp thay vì công thức lương giờ", () => {
  for (const name of [
    "confirm_teacher_work_session",
    "create_teacher_work_session",
    "sync_teacher_attendance_to_work_session",
  ]) {
    const body = functionBody(name);
    assert.match(body, /v_class_salary/);
    assert.doesNotMatch(body, /v_rate\s*\*\s*v_multiplier/);
  }
});
