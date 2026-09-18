import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260918025000_prevent_duplicate_substitution_requests.sql",
    import.meta.url
  ),
  "utf8"
);

const teacherPage = readFileSync(
  new URL("../app/teacher-substitution/page.tsx", import.meta.url),
  "utf8"
);

const adminPage = readFileSync(
  new URL("../app/teacher-payroll/substitution/page.tsx", import.meta.url),
  "utf8"
);

test("historical duplicates are retained and linked to one canonical request", () => {
  assert.match(migration, /add column if not exists duplicate_of_id uuid/i);
  assert.match(
    migration,
    /partition by r\.substitute_teacher_id, r\.class_id, r\.session_date/
  );
  assert.match(migration, /first_value\(r\.id\)/);
  assert.match(migration, /ws\.substitution_request_id = r\.id/);
  assert.match(migration, /when r\.status = 'approved' then 1/);
  assert.doesNotMatch(migration, /delete from public\.teacher_substitution_requests/i);
});

test("database permits only one canonical request per teacher, class, and date", () => {
  assert.match(
    migration,
    /create unique index if not exists teacher_substitution_requests_one_per_class_day/
  );
  assert.match(
    migration,
    /substitute_teacher_id,\s*class_id,\s*session_date[\s\S]*where duplicate_of_id is null/
  );
  assert.match(migration, /SUBSTITUTION_DUPLICATE_MARKER_PROTECTED/);
  assert.match(migration, /SUBSTITUTION_ARCHIVED_DUPLICATE/);
});

test("teacher UI has a synchronous click lock and a friendly duplicate message", () => {
  assert.match(teacherPage, /const sendingRef = useRef\(false\)/);
  assert.match(teacherPage, /if \(!teacher \|\| sendingRef\.current\) return/);
  assert.match(teacherPage, /sendingRef\.current = true/);
  assert.match(teacherPage, /insertError\.code === "23505"/);
  assert.match(
    teacherPage,
    /Bạn đã gửi yêu cầu dạy thay cho lớp này hôm nay\./
  );
  assert.match(teacherPage, /Boolean\(selectedExistingRequest\)/);
});

test("teacher and admin screens hide archived duplicate rows", () => {
  assert.match(teacherPage, /\.is\("duplicate_of_id", null\)/);
  assert.match(adminPage, /\.is\("duplicate_of_id", null\)/);
});

test("dedup migration remains non-destructive", () => {
  assert.doesNotMatch(migration, /drop\s+(table|column)/i);
  assert.doesNotMatch(migration, /truncate\s+/i);
});
