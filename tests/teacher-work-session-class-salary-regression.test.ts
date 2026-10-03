import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261003172000_fix_teacher_work_session_class_salary_constraint.sql",
    import.meta.url
  ),
  "utf8"
);

const otherRevenuePage = readFileSync(
  new URL("../app/other-revenue/page.tsx", import.meta.url),
  "utf8"
);

test("class-priced teacher work sessions no longer use the legacy hourly formula", () => {
  assert.match(
    migration,
    /drop constraint if exists teacher_work_session_amount_check/i
  );
  assert.match(
    migration,
    /class_salary_per_session_snapshot is null[\s\S]*?calculated_amount = class_salary_per_session_snapshot/i
  );
});

test("other revenue payment method callbacks do not overwrite each other with stale form state", () => {
  assert.match(
    otherRevenuePage,
    /onMethodChange=\{payment_method=>setForm\(current=>\(\{\.\.\.current,payment_method\}\)\)\}/
  );
  assert.match(
    otherRevenuePage,
    /onTransferAccountChange=\{transfer_account=>setForm\(current=>\(\{\.\.\.current,transfer_account\}\)\)\}/
  );
});

