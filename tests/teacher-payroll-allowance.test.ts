import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261001090000_add_teacher_payroll_allowance_and_adjustment_notes.sql",
    import.meta.url
  ),
  "utf8"
);

const page = readFileSync(
  new URL("../app/teacher-payroll/page.tsx", import.meta.url),
  "utf8"
);

test("migration chỉ thêm RPC, không đổi bảng hay backfill dữ liệu cũ", () => {
  assert.doesNotMatch(migration, /alter\s+table/i);
  assert.doesNotMatch(migration, /create\s+table/i);
  assert.match(migration, /save_teacher_payroll_with_meta_atomic/);
  assert.match(migration, /pay_teacher_payroll_with_allowance/);
});

test("ghi chú từng buổi chỉ lưu khi amount_override thật sự bật", () => {
  assert.match(
    migration,
    /set note = case when d\.amount_override then v_detail_note else null end/
  );
  assert.match(page, /Math\.abs\(actualAmount - calculatedAmount\) > 0\.01/);
  assert.match(page, /session\.override &&/);
  assert.match(page, /GHI CHÚ ĐIỀU CHỈNH/);
});

test("phụ cấp là khoản riêng theo kỳ và được cộng vào tổng phải trả", () => {
  assert.match(migration, /v_total_amount := v_base_total \+ v_allowance/);
  assert.match(migration, /Phụ cấp giáo viên/);
  assert.match(page, /p_allowance: item\.allowance/);
  assert.match(page, /🎁 PHỤ CẤP/);
});

test("UI dùng RPC mới nhưng giữ nguyên RPC cũ trong database để tương thích", () => {
  assert.match(page, /save_teacher_payroll_with_meta_atomic/);
  assert.match(page, /pay_teacher_payroll_with_allowance/);
  assert.doesNotMatch(migration, /drop\s+function\s+.*save_teacher_payroll_atomic/i);
  assert.doesNotMatch(migration, /drop\s+function\s+.*pay_teacher_payroll/i);
});
