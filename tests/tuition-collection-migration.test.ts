import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260927090000_atomic_tuition_collection.sql", import.meta.url),
  "utf8"
);
const tuitionPage = readFileSync(
  new URL("../app/tuition/page.tsx", import.meta.url),
  "utf8"
);

test("collection migration reuses the unique tuition period and old payment RPC atomically", () => {
  assert.match(migration, /on conflict \(student_id, class_id, billing_month\) do nothing/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /public\.record_tuition_payment_atomic\s*\(/i);
  assert.match(migration, /raise exception/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated/i);
});

test("collection rejects amount changes to existing periods and validates current membership", () => {
  assert.match(migration, /if abs\(coalesce\(v_tuition\.amount_due, 0\) - p_amount_due\) > 0\.01/i);
  assert.match(migration, /public\.class_students cs[\s\S]*cs\.status = 'active'[\s\S]*cs\.start_date[\s\S]*cs\.end_date/i);
  assert.match(migration, /v_student\.status is distinct from 'active'[\s\S]*v_class\.status is distinct from 'active'/i);
});

test("normal tuition UI no longer exposes bulk creation and collects through the idempotent ledger RPC", () => {
  assert.doesNotMatch(tuitionPage, /onClick=\{createMonthlyTuition\}/);
  assert.doesNotMatch(tuitionPage, /\+ Thu học phí/);
  assert.match(tuitionPage, /onSubmit=\{addTuition\}/);
  assert.match(tuitionPage, /rpc\("collect_tuition_payment_idempotent_atomic"/);
  assert.match(tuitionPage, /collectionRequestIdRef/);
  assert.match(tuitionPage, /THU HỌC PHÍ THEO HỌC VIÊN/);
  assert.ok(tuitionPage.indexOf("THU HỌC PHÍ THEO HỌC VIÊN") < tuitionPage.indexOf("ĐÃ THU THÁNG NÀY"));
  assert.ok(tuitionPage.indexOf("ĐÃ THU THÁNG NÀY") < tuitionPage.indexOf("Cần thu"));
  assert.ok(tuitionPage.indexOf("Cần thu") < tuitionPage.indexOf("QUẢN LÝ HỌC PHÍ THEO LỚP"));
});
