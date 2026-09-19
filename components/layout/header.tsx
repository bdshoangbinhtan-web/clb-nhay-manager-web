"use client";

import { createClient } from "@/lib/supabase/client";
import { vietnamCurrentMonth } from "@/lib/vietnam-date";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type TeacherSalarySummaryRow = {
  payroll_status: "draft" | "locked" | "paid" | null;
  total_sessions: number | null;
  detail_id: string | null;
};

type TeacherAttendanceSummaryRow = {
  class_id: string;
  attendance_date: string;
};

export default function Header({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [teacherSummary, setTeacherSummary] = useState<{
    sessions: number;
    status: "draft" | "locked" | "paid" | null;
  } | null>(null);

  const loadTeacherSummary = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "teacher" || !profile.is_active) {
      setTeacherSummary(null);
      return;
    }

    const currentMonthValue = vietnamCurrentMonth();
    const [year, month] = currentMonthValue.split("-").map(Number);
    const nextMonthValue =
      month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, "0")}`;

    const { data: teacher, error: teacherError } = await supabase
      .from("teachers")
      .select("id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (teacherError || !teacher) {
      console.error("Không xác định được giáo viên để đếm chấm công:", teacherError);
      return;
    }

    const [attendanceResult, salaryResult] = await Promise.all([
      supabase
        .from("teacher_attendance")
        .select("class_id,attendance_date")
        .eq("teacher_id", teacher.id)
        .eq("status", "taught")
        .gte("attendance_date", `${currentMonthValue}-01`)
        .lt("attendance_date", `${nextMonthValue}-01`),
      supabase.rpc("get_my_teacher_salary", {
        p_payroll_month: `${currentMonthValue}-01`,
      }),
    ]);

    if (attendanceResult.error) {
      console.error(
        "Không tải được dữ liệu chấm công trong tháng:",
        attendanceResult.error
      );
    }

    if (salaryResult.error) {
      console.error("Không tải được trạng thái bảng lương:", salaryResult.error);
    }

    const rows = (salaryResult.data ?? []) as TeacherSalarySummaryRow[];
    const first = rows[0];
    const savedSessions =
      first?.total_sessions != null
        ? Number(first.total_sessions)
        : rows.filter((row) => row.detail_id).length;
    const attendanceRows =
      (attendanceResult.data ?? []) as TeacherAttendanceSummaryRow[];
    const liveSessionKeys = new Set(
      attendanceRows.map(
        (row) => `${teacher.id}|${row.class_id}|${row.attendance_date}`
      )
    );

    setTeacherSummary({
      // Cả Admin chấm và giáo viên tự chấm đều hội tụ vào teacher_attendance.
      // Dedupe theo giáo viên + lớp + ngày để không bao giờ đếm trùng.
      sessions: attendanceResult.error ? savedSessions : liveSessionKeys.size,
      status: first?.payroll_status ?? null,
    });
  }, [supabase]);

  useEffect(() => {
    void loadTeacherSummary();

    const refresh = () => void loadTeacherSummary();
    window.addEventListener("teacher-attendance-updated", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("teacher-attendance-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loadTeacherSummary]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const payrollIsLocked =
    teacherSummary?.status === "locked" || teacherSummary?.status === "paid";
  const currentMonth = Number(vietnamCurrentMonth().slice(5, 7));

  return (
    <header className="sticky top-0 z-30 hidden min-h-[82px] items-center justify-between gap-2 border-b border-white/80 bg-white/70 px-3 py-2 backdrop-blur-xl sm:px-5 lg:flex lg:px-8">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          onClick={onMenu}
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-[0_6px_18px_rgba(35,50,75,.08)]"
          aria-label="Mở menu"
        >
          ☰
        </button>

        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold sm:text-[17px]">
            🏢 Quản lý CLB
          </div>
          <div className="mt-0.5 hidden text-xs font-medium text-slate-400 sm:block">
            Hệ thống quản lý trung tâm
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg shadow-[0_6px_18px_rgba(35,50,75,.08)] sm:flex"
            aria-label="Thông báo"
          >
            🔔
          </button>

          <button
            onClick={logout}
            className="ui-btn ui-btn-light flex items-center gap-1.5 px-3 py-2.5 sm:gap-2 sm:px-5"
          >
            🚪 <span>Đăng xuất</span>
          </button>
        </div>

        {teacherSummary && (
          <button
            type="button"
            onClick={() => router.push("/teacher-salary")}
            className="whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 shadow-sm sm:px-3 sm:text-xs"
          >
            <span className="sm:hidden">
              T{currentMonth}: {teacherSummary.sessions} buổi
            </span>
            <span className="hidden sm:inline">
              Tháng {currentMonth}: {teacherSummary.sessions} buổi đã chấm
            </span>
            <span className={payrollIsLocked ? "text-blue-600" : "text-amber-600"}>
              {payrollIsLocked ? " · Đã chốt" : " · Chưa chốt"}
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
