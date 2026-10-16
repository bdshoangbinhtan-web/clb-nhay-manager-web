import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261016190000_admin_only_unpaid_tuition_deletion.sql", import.meta.url),
  "utf8"
);
const page = readFileSync(
  new URL("../app/tuition/page.tsx", import.meta.url),
  "utf8"
);

test("managers cannot delete tuition or erase tuition payments through RLS", () => {
  assert.match(migration, /drop policy if exists tuition_manager_delete on public\.tuition;/i);
  assert.match(migration, /drop policy if exists tuition_payments_manager_delete on public\.tuition_payments;/i);
  assert.match(migration, /public\.is_admin\(\)/);
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /errcode = '42501'/);
});

test("Admin delete RPC never removes a receipt or adjusted tuition", () => {
  assert.match(migration, /coalesce\(v_tuition\.amount_paid, 0\) <> 0/);
  assert.match(migration, /exists \(select 1 from public\.tuition_payments/);
  assert.match(migration, /ta\.tuition_id = p_tuition_id or ta\.target_tuition_id = p_tuition_id/);
  assert.doesNotMatch(migration, /delete from public\.tuition_payments/i);
  assert.doesNotMatch(migration, /delete from public\.tuition_adjustments/i);
  assert.match(migration, /delete from public\.tuition where id = p_tuition_id/);
});

test("only active Admin sees deletion controls and inactive student's unpaid records remain discoverable", () => {
  assert.match(page, /setIsAdmin\(profileData\?\.role === "admin" && profileData\?\.is_active === true\)/);
  assert.match(page, /\{isAdmin && \(\s*<section className="ui-card/);
  assert.match(page, /adminUnpaidTuition\.slice\(0, 100\)/);
  assert.match(page, /onClick=\{\(\) => deleteTuition\(item\)\}/);
  assert.match(page, /const existingTuition = tuition\.find/);
  assert.match(page, /Cập nhật nghỉ học/);
  assert.match(page, /rpc\("admin_delete_unpaid_tuition"/);
});
