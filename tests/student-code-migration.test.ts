import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260918010000_add_student_codes.sql",
    import.meta.url
  ),
  "utf8"
);

test("student codes are added without replacing the UUID primary key", () => {
  assert.match(migration, /add column if not exists student_code text/i);
  assert.doesNotMatch(migration, /drop\s+(column|constraint).*\bid\b/i);
  assert.doesNotMatch(migration, /alter\s+column\s+id/i);
});

test("existing students are backfilled deterministically before NOT NULL", () => {
  const unique = migration.indexOf("create unique index if not exists students_student_code_key");
  const backfill = migration.indexOf("row_number() over (order by created_at asc nulls last, id asc)");
  const validation = migration.indexOf("student_code validation failed");
  const notNull = migration.indexOf("alter column student_code set not null");

  assert.ok(unique >= 0);
  assert.ok(backfill > unique);
  assert.ok(validation > backfill);
  assert.ok(notNull > validation);
});

test("new codes use a non-cycling sequence and an insert trigger", () => {
  assert.match(migration, /create sequence if not exists public\.student_code_seq[\s\S]*maxvalue 999999[\s\S]*no cycle/i);
  assert.match(migration, /before insert on public\.students/i);
  assert.match(migration, /nextval\('public\.student_code_seq'\)/i);
  assert.match(migration, /'HV' \|\| lpad/i);
  assert.doesNotMatch(migration, /if new\.student_code is null/i);
  assert.match(migration, /create unique index if not exists students_student_code_key/i);
  assert.match(migration, /before update of student_code on public\.students/i);
  assert.match(migration, /greatest\([\s\S]*v_max_code[\s\S]*v_sequence_value/i);
});

test("teacher roster exposes the display code but keeps UUID student_id", () => {
  assert.match(migration, /get_teacher_student_attendance_roster_v2/);
  assert.match(migration, /student_id uuid,[\s\S]*student_code text/);
  assert.match(migration, /join public\.students s on s\.id = cs\.student_id/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});
