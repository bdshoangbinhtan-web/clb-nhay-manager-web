"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { vietnamCurrentMonth } from "@/lib/vietnam-date";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeRefresh } from "@/components/realtime/global-realtime-provider";

type SalaryRow = {
  teacher_id: string;
  teacher_name: string;
  payroll_status: "draft" | "locked" | "paid" | null;
  total_amount: number | null;
  class_id: string | null;
  attendance_date: string | null;
  actual_amount: number | null;
};

type TeachingSession = {
  attendance_id: string;
  class_id: string;
  class_name: string | null;
  attendance_date: string;
  teaching_type: "regular" | "substitute";
  standing_teacher_name: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `Tháng ${month}/${year}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function TeacherSalaryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(vietnamCurrentMonth);
  const [salaryRows, setSalaryRows] = useState<SalaryRow[]>([]);
  const [sessions, setSessions] = useState<TeachingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRequestRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");

    // Hai nguồn độc lập: lịch dạy từ chấm công, tiền từ bảng lương đã khóa.
    const [salaryResult, sessionResult] = await Promise.all([
      supabase.rpc("get_my_teacher_salary", {
        p_payroll_month: `${month}-01`,
      }),
      supabase.rpc("get_my_teacher_sessions", {
        p_month: `${month}-01`,
      }),
    ]);

    if (requestId !== loadRequestRef.current) return;

    if (salaryResult.error || sessionResult.error) {
      const reason = sessionResult.error ?? salaryResult.error;
      console.error("Teacher salary/session load failed", reason);
      setError("Không tải được chấm công. Vui lòng thử lại.\n\n" + reason?.message);
      // Không báo nhầm 0 buổi khi truy vấn bị lỗi.
      setSalaryRows([]);
      setSessions([]);
      setLoading(false);
      return;
    }

    const resultRows = (salaryResult.data ?? []) as SalaryRow[];
    if (resultRows.length === 0) {
      setError("Không tìm thấy hồ sơ giáo viên đang hoạt động cho tài khoản này.");
      setSalaryRows([]);
      setSessions([]);
      setLoading(false);
      return;
    }

    setSalaryRows(resultRows);
    setSessions((sessionResult.data ?? []) as TeachingSession[]);
    setLoading(false);
  }, [month, supabase]);

  useEffect(() => {
    void loadData();
    return () => { loadRequestRef.current += 1; };
  }, [loadData]);

  useRealtimeRefresh(["payroll"], loadData);

  const first = salaryRows[0];
  const isLocked = first?.payroll_status === "locked" || first?.payroll_status === "paid";
  const amounts = useMemo(() => {
    if (!isLocked) return new Map<string, number>();
    return new Map(
      salaryRows
        .filter((row) => row.class_id && row.attendance_date && row.actual_amount !== null)
        .map((row) => [
          `${row.class_id}|${row.attendance_date}`,
          Number(row.actual_amount),
        ])
    );
  }, [isLocked, salaryRows]);

  return (
    <div className="space-y-6">
      <section>
        <div className="text-xs font-black uppercase tracking-widest text-blue-600">
          Giáo viên
        </div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">💰 Lương của tôi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Buổi dạy hiển thị sau khi được ghi nhận. Chỉ hiện tiền khi Admin chốt lương.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-500">Kỳ lương</div>
          <div className="mt-1 text-xl font-black text-slate-900">{monthLabel(month)}</div>
        </div>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="rounded-xl border bg-white px-4 py-3 font-semibold text-slate-800"
        />
      </section>

      {error && (
        <div className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-slate-500">Đang tải...</div>
      ) : !error && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-bold text-slate-400">Giáo viên</div>
              <div className="mt-2 text-xl font-black text-slate-900">
                {first?.teacher_name}
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-bold text-slate-400">Số buổi đã dạy</div>
              <div className="mt-2 text-3xl font-black text-slate-900">
                {sessions.length}
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-bold text-slate-400">Lương</div>
              {isLocked ? (
                <div className="mt-2 text-2xl font-black text-emerald-600">
                  {money(Number(first?.total_amount ?? 0))}
                </div>
              ) : (
                <div className="mt-2 text-lg font-bold text-amber-600">🔒 Chưa chốt</div>
              )}
            </div>
          </section>

          {!isLocked && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
              <div className="font-black">🔒 Lương chưa được chốt</div>
              <div className="mt-1 text-sm">
                Bạn có thể xem đầy đủ ngày và lớp đã dạy. Số tiền chỉ hiển thị khi
                Admin chốt kỳ lương.
              </div>
            </div>
          )}

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">
              Chi tiết buổi dạy ({sessions.length})
            </h2>
            {sessions.length === 0 ? (
              <p className="mt-4 text-slate-500">Chưa có buổi dạy nào được ghi nhận trong tháng.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {sessions.map((session) => {
                  const key = `${session.class_id}|${session.attendance_date}`;
                  const amount = amounts.get(key);
                  return (
                    <div key={session.attendance_id} className="rounded-2xl border bg-slate-50 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-black text-slate-900">
                            {formatDate(session.attendance_date)}
                          </div>
                          <div className="mt-1 text-lg font-bold text-slate-900">
                            {session.class_name ?? "Lớp không xác định"}
                          </div>
                          {session.teaching_type === "substitute" ? (
                            <div className="mt-1 font-semibold text-blue-700">
                              🔄 Dạy thay{session.standing_teacher_name
                                ? ` · GV đứng lớp: ${session.standing_teacher_name}`
                                : ""}
                            </div>
                          ) : (
                            <div className="mt-1 text-sm text-slate-500">
                              👨‍🏫 Dạy theo phân công
                            </div>
                          )}
                        </div>
                        {isLocked && (
                          <div className="font-black text-emerald-700">
                            {amount !== undefined ? money(amount) : "Chưa có chi tiết lương"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
