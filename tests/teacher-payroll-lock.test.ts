import assert from "node:assert/strict";
import test from "node:test";

import {
  findPayrollLock,
  teacherAttendanceErrorMessage,
  type PayrollLockRow,
} from "../lib/teacher-payroll-lock.ts";

const teacherA = "teacher-a";
const teacherB = "teacher-b";
const september = "2026-09-01";

function row(
  teacher_id: string,
  status: PayrollLockRow["status"],
  payroll_month = september
): PayrollLockRow {
  return { teacher_id, payroll_month, status };
}

test("chưa có hoặc còn draft thì không khóa", () => {
  assert.equal(findPayrollLock([], teacherA, "2026-09-13"), false);
  assert.equal(
    findPayrollLock([row(teacherA, "draft")], teacherA, "2026-09-13"),
    false
  );
});

test("locked khóa đúng giáo viên và đúng kỳ", () => {
  assert.equal(
    findPayrollLock([row(teacherA, "locked")], teacherA, "2026-09-13"),
    true
  );
});

test("paid cũng khóa", () => {
  assert.equal(
    findPayrollLock([row(teacherA, "paid")], teacherA, "2026-09-13"),
    true
  );
});

test("giáo viên khác cùng tháng không khóa nhầm", () => {
  assert.equal(
    findPayrollLock([row(teacherB, "paid")], teacherA, "2026-09-13"),
    false
  );
});

test("nhiều lớp của cùng giáo viên dùng chung đúng khóa tháng", () => {
  const payrolls = [row(teacherA, "locked")];

  assert.equal(findPayrollLock(payrolls, teacherA, "2026-09-06"), true);
  assert.equal(findPayrollLock(payrolls, teacherA, "2026-09-13"), true);
  assert.equal(findPayrollLock(payrolls, teacherA, "2026-09-27"), true);
});

test("payroll của tháng khác không khóa", () => {
  assert.equal(
    findPayrollLock(
      [row(teacherA, "locked", "2026-08-01")],
      teacherA,
      "2026-09-13"
    ),
    false
  );
});

test("duplicate cùng teacher và kỳ bị phát hiện, không chọn LIMIT 1 tùy ý", () => {
  assert.throws(
    () =>
      findPayrollLock(
        [row(teacherA, "draft"), row(teacherA, "locked")],
        teacherA,
        "2026-09-13"
      ),
    /Trùng bảng lương/
  );
});

test("P0001 không liên quan payroll không còn bị gán nhầm là đã chốt", () => {
  assert.equal(
    teacherAttendanceErrorMessage({
      code: "P0001",
      message: "Lịch lớp phải có ít nhất một ngày học",
    }),
    "❌ Lịch lớp phải có ít nhất một ngày học"
  );
});

test("chỉ marker payroll lock thật mới hiện thông báo khóa", () => {
  assert.equal(
    teacherAttendanceErrorMessage({
      code: "P0001",
      details: "TEACHER_PAYROLL_LOCKED",
      message:
        "Bảng lương tháng này đã chốt, không thể sửa điểm danh giáo viên",
    }),
    "🔒 Bảng lương tháng này đã chốt, không thể sửa điểm danh."
  );
});
