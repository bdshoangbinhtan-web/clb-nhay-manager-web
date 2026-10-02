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
const dueStatus = readFileSync(
  new URL("../lib/tuition/due-status.ts", import.meta.url),
  "utf8"
);
const paymentFields = readFileSync(
  new URL("../components/payment-method-fields.tsx", import.meta.url),
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
  assert.doesNotMatch(tuitionPage, /Tạo học phí|onClick=\{createMonthlyTuition\}/i);
  assert.match(tuitionPage, /onSubmit=\{addTuition\}/);
  assert.match(tuitionPage, /rpc\("collect_tuition_payment_idempotent_atomic"/);
  assert.match(tuitionPage, /collectionRequestIdRef/);
  assert.match(tuitionPage, /collectionRequestIdRef\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(tuitionPage, /p_payment_date: null/);
  assert.match(tuitionPage, /if \(amount > remainingAmount\)/);
  assert.match(tuitionPage, /p_payment_method: paymentMethod/);
  assert.match(tuitionPage, /PaymentMethodFields method=\{paymentMethod\}/);
  assert.match(paymentFields, /<option value="cash">Tiền mặt<\/option>[\s\S]*?<option value="transfer">Chuyển khoản<\/option>/);
  assert.match(tuitionPage, /placeholder="🔎 Tìm tên hoặc mã học viên\.\.\."/);
  assert.ok(tuitionPage.indexOf("placeholder=\"🔎 Tìm tên hoặc mã học viên...\"") < tuitionPage.indexOf("ĐÃ THU THÁNG NÀY"));
  assert.ok(tuitionPage.indexOf("ĐÃ THU THÁNG NÀY") < tuitionPage.indexOf("HỌC VIÊN CẦN THU"));
  assert.ok(tuitionPage.indexOf("HỌC VIÊN CẦN THU") < tuitionPage.indexOf("Danh sách cần xử lý"));
  assert.ok(tuitionPage.indexOf("Danh sách cần xử lý") < tuitionPage.indexOf("QUẢN LÝ HỌC PHÍ THEO LỚP"));
  assert.match(tuitionPage, /function openCollectionForDueRow/);
  assert.match(tuitionPage, /amountToCollectInputRef\.current\?\.focus/);
  assert.match(tuitionPage, /ref=\{amountToCollectInputRef\}/);
  assert.match(dueStatus, /TUITION_TRACKING_START_MONTH = "2026-10"/);
});
