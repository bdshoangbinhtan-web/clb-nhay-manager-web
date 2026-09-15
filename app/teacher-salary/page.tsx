"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SalaryRow = {
  teacher_id: string;
  teacher_name: string;
  payroll_id: string | null;
  payroll_status: "draft" | "locked" | "paid" | null;
  total_sessions: number | null;
  total_amount: number | null;
  detail_id: string | null;
  class_id: string | null;
  class_name: string | null;
  attendance_date: string | null;
  teaching_type: "regular" | "substitute" | null;
  standing_teacher_id: string | null;
  standing_teacher_name: string | null;
  salary_rate: number | null;
  duration_multiplier: number | null;
  calculated_amount: number | null;
  actual_amount: number | null;
  amount_override: boolean | null;
};

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

function getLocalMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `Tháng ${month}/${year}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function TeacherSalaryPage() {
  const supabase = createClient();

  const [month, setMonth] = useState(getLocalMonth());
  const [rows, setRows] = useState<SalaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc("get_my_teacher_salary", {
      p_payroll_month: `${month}-01`,
    });

    if (error) {
      console.error(error);
      setError("Không tải được dữ liệu lương.\n\n" + error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as SalaryRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [month]);

  const first = rows[0];

  const payrollStatus = first?.payroll_status ?? null;
  const isLocked = payrollStatus === "locked" || payrollStatus === "paid";

  const totalSessions = useMemo(() => {
    if (first?.total_sessions != null) {
      return Number(first.total_sessions);
    }

    return rows.filter((row) => row.detail_id).length;
  }, [first, rows]);

  const totalAmount = useMemo(() => {
    if (!isLocked) return 0;
    return Number(first?.total_amount ?? 0);
  }, [first, isLocked]);

  const teacherName = first?.teacher_name ?? "Giáo viên";

  return (
    <div className="space-y-6">
      <section>
        <div className="text-xs font-black uppercase tracking-widest text-blue-600">
          Giáo viên
        </div>

        <h1 className="mt-1 text-2xl font-black text-slate-900">
          💰 Lương của tôi
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Chỉ hiển thị thông tin lương của chính bạn.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-500">Kỳ lương</div>
          <div className="mt-1 text-xl font-black text-slate-900">
            {monthLabel(month)}
          </div>
        </div>

        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border bg-white px-4 py-3 font-semibold text-slate-800"
        />
      </section>

      {error && (
        <div className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-slate-500">
          Đang tải...
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-bold text-slate-400">
                Giáo viên
              </div>
              <div className="mt-2 text-xl font-black text-slate-900">
                {teacherName}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-bold text-slate-400">
                Số buổi
              </div>
              <div className="mt-2 text-3xl font-black text-slate-900">
                {totalSessions}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-bold text-slate-400">
                Lương
              </div>

              {isLocked ? (
                <div className="mt-2 text-2xl font-black text-emerald-600">
                  {money(totalAmount)}
                </div>
              ) : (
                <div className="mt-2 text-lg font-bold text-amber-600">
                  🔒 Chưa chốt
                </div>
              )}
            </div>
          </section>

          {!isLocked && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
              <div className="font-black">
                🔒 Lương chưa được chốt
              </div>
              <div className="mt-1 text-sm">
                Bạn vẫn có thể xem số buổi đã ghi nhận, nhưng số tiền lương
                chỉ được hiển thị sau khi Admin chốt kỳ lương.
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <section className="rounded-2xl border bg-white p-6 text-slate-500 shadow-sm">
              Tháng này chưa có dữ liệu buổi dạy.
            </section>
          ) : (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-900">
                Chi tiết buổi dạy
              </h2>

              <div className="mt-4 space-y-3">
                {rows
                  .filter((row) => row.detail_id)
                  .map((row) => {
                    const isSubstitute =
                      row.teaching_type === "substitute";

                    return (
                      <div
                        key={row.detail_id}
                        className="rounded-2xl border bg-slate-50 p-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="font-black text-slate-900">
                              {formatDate(row.attendance_date)}
                            </div>

                            <div className="mt-1 text-lg font-bold text-slate-900">
                              {row.class_name ?? "Lớp không xác định"}
                            </div>

                            {isSubstitute && (
                              <div className="mt-1 font-bold text-blue-700">
                                🔄 Dạy thay · GV đứng lớp:{" "}
                                {row.standing_teacher_name ?? "—"}
                              </div>
                            )}

                            {!isSubstitute && (
                              <div className="mt-1 text-sm text-slate-500">
                                👨‍🏫 Buổi dạy theo phân công
                              </div>
                            )}
                          </div>

                          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3 lg:min-w-[560px]">
                            <div>
                              <div className="font-bold text-slate-400">
                                Rate
                              </div>
                              <div className="font-black text-slate-800">
                                {money(Number(row.salary_rate ?? 0))}/giờ
                              </div>
                            </div>

                            <div>
                              <div className="font-bold text-slate-400">
                                Hệ số
                              </div>
                              <div className="font-black text-slate-800">
                                {Number(
                                  row.duration_multiplier ?? 1
                                ).toLocaleString("vi-VN")}x
                              </div>
                            </div>

                            <div>
                              <div className="font-bold text-slate-400">
                                Tiền
                              </div>

                              {isLocked ? (
                                <div className="font-black text-emerald-600">
                                  {money(Number(row.actual_amount ?? 0))}
                                </div>
                              ) : (
                                <div className="font-bold text-amber-600">
                                  🔒 Chưa chốt
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {isLocked && row.amount_override && (
                          <div className="mt-3 text-sm font-bold text-orange-600">
                            ✏️ Admin đã chỉnh riêng buổi này
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
