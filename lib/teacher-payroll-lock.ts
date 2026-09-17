export type PayrollLockRow = {
  teacher_id: string;
  payroll_month: string;
  status: string | null;
};

export type DatabaseErrorLike = {
  code?: string | null;
  details?: string | null;
  message?: string | null;
};

export const PAYROLL_LOCKED_DETAIL = "TEACHER_PAYROLL_LOCKED";

export function payrollMonthForDate(attendanceDate: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(attendanceDate);

  if (!match) {
    throw new Error("Ngày điểm danh không hợp lệ.");
  }

  return `${match[1]}-${match[2]}-01`;
}

export function isPayrollStatusLocked(status: string | null | undefined) {
  return status === "locked" || status === "paid";
}

/**
 * Mirrors the database lock key: exactly one teacher and one payroll month.
 * Multiple classes taught by that teacher intentionally share the same lock.
 */
export function findPayrollLock(
  payrolls: PayrollLockRow[],
  teacherId: string,
  attendanceDate: string
) {
  const payrollMonth = payrollMonthForDate(attendanceDate);
  const matches = payrolls.filter(
    (payroll) =>
      payroll.teacher_id === teacherId &&
      payroll.payroll_month === payrollMonth
  );

  if (matches.length > 1) {
    throw new Error("Trùng bảng lương cho cùng giáo viên và kỳ lương.");
  }

  return isPayrollStatusLocked(matches[0]?.status);
}

export function teacherAttendanceErrorMessage(error: DatabaseErrorLike) {
  const message = String(error.message ?? "").trim();
  const isRealPayrollLock =
    error.details === PAYROLL_LOCKED_DETAIL ||
    message ===
      "Bảng lương tháng này đã chốt, không thể sửa điểm danh giáo viên";

  if (isRealPayrollLock) {
    return "🔒 Bảng lương tháng này đã chốt, không thể sửa điểm danh.";
  }

  if (message) {
    return `❌ ${message}`;
  }

  return "❌ Không thể lưu điểm danh giáo viên.";
}
