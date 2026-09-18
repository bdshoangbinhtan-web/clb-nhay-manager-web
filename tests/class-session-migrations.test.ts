import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readMigration(name: string) {
  return readFileSync(
    new URL(`../supabase/migrations/${name}`, import.meta.url),
    "utf8"
  );
}

const foundation = readMigration(
  "20260918030000_create_class_sessions_foundation.sql"
);
const backfill = readMigration(
  "20260918040000_backfill_class_sessions.sql"
);
const dualWrite = readMigration(
  "20260918050000_enable_class_session_dual_write.sql"
);

test("foundation is additive and preserves every legacy identity", () => {
  assert.match(foundation, /create table if not exists public\.class_sessions/i);
  assert.match(foundation, /id uuid primary key default gen_random_uuid\(\)/i);

  for (const table of [
    "attendance",
    "teacher_attendance",
    "teacher_work_sessions",
    "teacher_substitution_requests",
    "teacher_payroll_details",
  ]) {
    assert.match(
      foundation,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?class_session_id uuid`, "i")
    );
  }

  assert.doesNotMatch(foundation, /drop\s+(table|column|constraint)/i);
  assert.doesNotMatch(foundation, /alter\s+column\s+id/i);
  assert.match(foundation, /enable row level security/i);
  assert.doesNotMatch(foundation, /create policy/i);
});

test("class session stores actual teaching, substitution, and salary facts", () => {
  for (const column of [
    "scheduled_teacher_id",
    "actual_teacher_id",
    "teaching_type",
    "status",
    "substitution_request_id",
    "salary_rate_snapshot",
    "salary_override",
  ]) {
    assert.match(foundation, new RegExp(`\\b${column}\\b`));
  }

  assert.match(
    foundation,
    /teaching_type in \('regular', 'substitute', 'makeup', 'extra'\)/
  );
  assert.match(
    foundation,
    /status in \('scheduled', 'completed', 'cancelled'\)/
  );
  assert.match(
    foundation,
    /teacher_work_session_id[\s\S]*references public\.teacher_work_sessions\(id\)[\s\S]*on delete set null/i
  );
});

test("backfill refuses ambiguous history before linking any rows", () => {
  const preflight = backfill.indexOf("do $preflight$");
  const insert = backfill.indexOf("insert into public.class_sessions");
  const linkAttendance = backfill.indexOf("update public.attendance");

  assert.ok(preflight >= 0);
  assert.ok(insert > preflight);
  assert.ok(linkAttendance > insert);
  assert.match(backfill, /CLASS_SESSION_WORK_SESSION_COLLISION/);
  assert.match(backfill, /CLASS_SESSION_TEACHER_ATTENDANCE_COLLISION/);
  assert.match(backfill, /CLASS_SESSION_APPROVED_SUBSTITUTION_COLLISION/);
  assert.match(backfill, /CLASS_SESSION_ACTUAL_TEACHER_COLLISION/);
  assert.match(backfill, /CLASS_SESSION_EXISTING_TARGET_COLLISION/);
  assert.match(backfill, /CLASS_SESSION_BACKFILL_MAPPING_FAILURE/);
});

test("completed legacy salary never falls back to the current class rate", () => {
  const snapshot = backfill.slice(
    backfill.indexOf("coalesce(ws.substitution_request_id"),
    backfill.indexOf("as salary_override")
  );

  assert.match(snapshot, /ws\.class_salary_per_session_snapshot/);
  assert.match(snapshot, /ws\.calculated_amount/);
  assert.match(snapshot, /pd\.calculated_amount/);
  assert.match(snapshot, /then c\.teacher_salary_per_session/);
  assert.match(snapshot, /ws\.id is null/);
  assert.match(snapshot, /taught\.teacher_id is null/);
  assert.match(snapshot, /not coalesce\(student_attendance\.has_attendance, false\)/);
  assert.match(snapshot, /pd\.id is null/);
});

test("dual write leaves legacy RPC signatures untouched and rejects ambiguity", () => {
  assert.doesNotMatch(
    dualWrite,
    /create or replace function public\.(confirm_teacher_work_session|create_teacher_work_session|sync_teacher_attendance_to_work_session)\s*\(/
  );
  assert.match(dualWrite, /CLASS_SESSION_AMBIGUOUS/);
  assert.match(dualWrite, /CLASS_SESSION_IDENTITY_MISMATCH/);
  assert.match(dualWrite, /CLASS_SESSION_ACTUAL_TEACHER_MISMATCH/);
  assert.match(dualWrite, /CLASS_SESSION_SUBSTITUTION_MISMATCH/);
});

test("every new dependent record is linked to its class session", () => {
  for (const trigger of [
    "link_attendance_to_class_session",
    "link_teacher_attendance_to_class_session",
    "link_work_session_to_class_session",
    "link_substitution_to_class_session",
    "link_payroll_detail_to_class_session",
  ]) {
    assert.match(dualWrite, new RegExp(`create trigger ${trigger}`));
  }

  assert.match(
    dualWrite,
    /ws\.class_session_id = new\.class_session_id[\s\S]*ws\.actual_teacher_id = v_actual_teacher_id/
  );
  assert.match(dualWrite, /PAYROLL_WORK_SESSION_MISMATCH/);
  assert.match(dualWrite, /CLASS_SESSION_DUAL_WRITE_GAP/);
  assert.match(
    dualWrite,
    /update public\.teacher_substitution_requests[\s\S]*where class_session_id is null/
  );
});

test("completed salary and locked payroll history are immutable", () => {
  assert.match(dualWrite, /CLASS_SESSION_SALARY_SNAPSHOT_IMMUTABLE/);
  assert.match(dualWrite, /CLASS_SESSION_PAYROLL_LOCKED/);
  assert.match(dualWrite, /p\.status in \('locked', 'paid'\)/);
  assert.match(dualWrite, /guard_deleted_work_session/);
  assert.match(dualWrite, /reconcile_deleted_work_session/);
});

test("teacher attendance records the actual teacher without overwriting schedule", () => {
  const start = dualWrite.indexOf(
    "function public.link_teacher_attendance_to_class_session()"
  );
  const end = dualWrite.indexOf(
    "function public.link_work_session_to_class_session()",
    start
  );
  const body = dualWrite.slice(start, end);

  assert.match(
    body,
    /new\.attendance_date,\s*null,\s*case when new\.status = 'taught' then new\.teacher_id/
  );
  assert.doesNotMatch(
    body,
    /new\.attendance_date,\s*new\.teacher_id,\s*new\.teacher_id/
  );
  assert.match(dualWrite, /absent\.status = 'absent'/);
  assert.match(dualWrite, /reconcile_class_session_after_teacher_attendance/);
});

test("the migration package contains no destructive table or column operation", () => {
  const packageSql = [foundation, backfill, dualWrite].join("\n");
  assert.doesNotMatch(packageSql, /drop\s+table/i);
  assert.doesNotMatch(packageSql, /drop\s+column/i);
  assert.doesNotMatch(packageSql, /truncate\s+/i);
});
