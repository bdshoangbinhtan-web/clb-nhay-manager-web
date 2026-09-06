"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Teacher = {
  id: string;
  full_name: string;
  salary_rate: number | null;
  status: string;
};

type ClassItem = {
  id: string;
  name: string;
};

type Attendance = {
  teacher_id: string;
  class_id: string;
  attendance_date: string;
  status: string;
};

type PayrollDetail = {
  id?: string;
  class_id: string;
  sessions: number;
  salary_rate: number;
  amount: number;
  class_name?: string;
};

type Payroll = {
  id: string;
  teacher_id: string;
  payroll_month: string;
  total_sessions: number;
  salary_rate: number;
  total_amount: number;
  status: "draft" | "locked" | "paid";
};

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `Tháng ${month}/${year}`;
}

export default function TeacherPayrollPage() {
  const supabase = createClient();

  const [month, setMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [details, setDetails] = useState<
    Record<string, PayrollDetail[]>
  >({});

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);

    const start = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0)
      .toISOString()
      .slice(0, 10);

    const [
      teachersRes,
      classesRes,
      attendanceRes,
      payrollsRes,
    ] = await Promise.all([
      supabase
        .from("teachers")
        .select("id,full_name,salary_rate,status")
        .eq("status", "active")
        .order("full_name"),

      supabase
        .from("classes")
        .select("id,name")
        .order("name"),

      supabase
        .from("teacher_attendance")
        .select("teacher_id,class_id,attendance_date,status")
        .gte("attendance_date", start)
        .lte("attendance_date", lastDay)
        .eq("status", "taught"),

      supabase
        .from("teacher_payrolls")
        .select(
          "id,teacher_id,payroll_month,total_sessions,salary_rate,total_amount,status"
        )
        .eq("payroll_month", start),
    ]);

    if (teachersRes.error) {
      console.error(teachersRes.error);
      alert("❌ Không tải được danh sách giáo viên.");
    }

    if (classesRes.error) {
      console.error(classesRes.error);
      alert("❌ Không tải được danh sách lớp.");
    }

    if (attendanceRes.error) {
      console.error(attendanceRes.error);
      alert(
        "❌ Không tải được điểm danh giáo viên.\n\n" +
          attendanceRes.error.message
      );
    }

    if (payrollsRes.error) {
      console.error(payrollsRes.error);
      alert(
        "❌ Không tải được bảng lương.\n\n" +
          payrollsRes.error.message
      );
    }

    setTeachers(teachersRes.data ?? []);
    setClasses(classesRes.data ?? []);
    setAttendance(attendanceRes.data ?? []);
    setPayrolls(payrollsRes.data ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [month]);

  const classMap = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes]
  );

  const payrollTeacherIds = useMemo(
    () => new Set(payrolls.map((item) => item.teacher_id)),
    [payrolls]
  );

  const calculated = useMemo(() => {
    const map = new Map<
      string,
      {
        teacher: Teacher;
        totalSessions: number;
        totalAmount: number;
        details: PayrollDetail[];
      }
    >();

    for (const row of attendance) {
      const teacher = teachers.find(
        (item) => item.id === row.teacher_id
      );

      if (!teacher) continue;

      const rate = Number(teacher.salary_rate || 0);

      if (!map.has(teacher.id)) {
        map.set(teacher.id, {
          teacher,
          totalSessions: 0,
          totalAmount: 0,
          details: [],
        });
      }

      const item = map.get(teacher.id)!;
      item.totalSessions += 1;
      item.totalAmount += rate;

      const existing = item.details.find(
        (detail) => detail.class_id === row.class_id
      );

      if (existing) {
        existing.sessions += 1;
        existing.amount += rate;
      } else {
        item.details.push({
          class_id: row.class_id,
          sessions: 1,
          salary_rate: rate,
          amount: rate,
          class_name: classMap.get(row.class_id) ?? "Lớp không xác định",
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.teacher.full_name.localeCompare(
        b.teacher.full_name,
        "vi"
      )
    );
  }, [attendance, teachers, classMap]);

  async function createOrUpdateDraft(item: (typeof calculated)[number]) {
    const payrollMonth = `${month}-01`;

    const existing = payrolls.find(
      (payroll) => payroll.teacher_id === item.teacher.id
    );

    if (existing?.status === "locked" || existing?.status === "paid") {
      alert("🔒 Bảng lương này đã chốt, không thể tính lại.");
      return;
    }

    setWorking(true);

    let payrollId = existing?.id;

    if (payrollId) {
      const { error } = await supabase
        .from("teacher_payrolls")
        .update({
          total_sessions: item.totalSessions,
          salary_rate: Number(item.teacher.salary_rate || 0),
          total_amount: item.totalAmount,
          status: "draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payrollId);

      if (error) {
        setWorking(false);
        alert("❌ Không thể cập nhật bảng lương.\n\n" + error.message);
        return;
      }

      await supabase
        .from("teacher_payroll_details")
        .delete()
        .eq("payroll_id", payrollId);
    } else {
      const { data, error } = await supabase
        .from("teacher_payrolls")
        .insert({
          teacher_id: item.teacher.id,
          payroll_month: payrollMonth,
          total_sessions: item.totalSessions,
          salary_rate: Number(item.teacher.salary_rate || 0),
          total_amount: item.totalAmount,
          status: "draft",
        })
        .select(
          "id,teacher_id,payroll_month,total_sessions,salary_rate,total_amount,status"
        )
        .single();

      if (error || !data) {
        setWorking(false);
        alert(
          "❌ Không thể tạo bảng lương.\n\n" +
            (error?.message ?? "")
        );
        return;
      }

      payrollId = data.id;
    }

    const detailRows = item.details.map((detail) => ({
      payroll_id: payrollId,
      class_id: detail.class_id,
      sessions: detail.sessions,
      salary_rate: detail.salary_rate,
      amount: detail.amount,
    }));

    const { error: detailError } = await supabase
      .from("teacher_payroll_details")
      .insert(detailRows);

    setWorking(false);

    if (detailError) {
      alert(
        "❌ Không thể lưu chi tiết bảng lương.\n\n" +
          detailError.message
      );
      return;
    }

    alert(`✅ Đã tính lương cho ${item.teacher.full_name}.`);
    await loadData();
  }

  async function lockPayroll(item: (typeof calculated)[number]) {
    const existing = payrolls.find(
      (payroll) => payroll.teacher_id === item.teacher.id
    );

    if (existing?.status === "paid") {
      alert("Bảng lương này đã chi.");
      return;
    }

    if (existing?.status === "locked") {
      alert("Bảng lương này đã được chốt.");
      return;
    }

    const ok = window.confirm(
      `🔒 CHỐT LƯƠNG ${item.teacher.full_name}?\n\n` +
        `${item.totalSessions} buổi × ${money(
          Number(item.teacher.salary_rate || 0)
        )}\n` +
        `Tổng: ${money(item.totalAmount)}\n\n` +
        `Sau khi chốt, bảng lương này sẽ không tự thay đổi.`
    );

    if (!ok) return;

    setWorking(true);

    const { data: existingPayroll } = await supabase
      .from("teacher_payrolls")
      .select("id,status")
      .eq("teacher_id", item.teacher.id)
      .eq("payroll_month", `${month}-01`)
      .maybeSingle();

    let payrollId = existingPayroll?.id;

    if (!payrollId) {
      const { data, error } = await supabase
        .from("teacher_payrolls")
        .insert({
          teacher_id: item.teacher.id,
          payroll_month: `${month}-01`,
          total_sessions: item.totalSessions,
          salary_rate: Number(item.teacher.salary_rate || 0),
          total_amount: item.totalAmount,
          status: "locked",
        })
        .select("id")
        .single();

      if (error || !data) {
        setWorking(false);
        alert(
          "❌ Không thể chốt lương.\n\n" +
            (error?.message ?? "")
        );
        return;
      }

      payrollId = data.id;

      const { error: detailError } = await supabase
        .from("teacher_payroll_details")
        .insert(
          item.details.map((detail) => ({
            payroll_id: payrollId,
            class_id: detail.class_id,
            sessions: detail.sessions,
            salary_rate: detail.salary_rate,
            amount: detail.amount,
          }))
        );

      if (detailError) {
        setWorking(false);
        alert(
          "❌ Không thể lưu chi tiết chốt lương.\n\n" +
            detailError.message
        );
        return;
      }
    } else if (existingPayroll) {
      if (existingPayroll.status === "locked") {
        setWorking(false);
        alert("Bảng lương này đã được chốt.");
        return;
      }

      const { error } = await supabase
        .from("teacher_payrolls")
        .update({
          total_sessions: item.totalSessions,
          salary_rate: Number(item.teacher.salary_rate || 0),
          total_amount: item.totalAmount,
          status: "locked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payrollId);

      if (error) {
        setWorking(false);
        alert(
          "❌ Không thể chốt lương.\n\n" +
            error.message
        );
        return;
      }
    }

    setWorking(false);
    alert(`🔒 Đã chốt lương ${item.teacher.full_name}.`);
    await loadData();
  }

  async function payPayroll(item: (typeof calculated)[number]) {
    const existing = payrolls.find(
      (payroll) => payroll.teacher_id === item.teacher.id
    );

    if (!existing) {
      alert("⚠️ Bảng lương chưa được chốt.");
      return;
    }

    if (existing.status === "paid") {
      alert("🟢 Bảng lương này đã được chi.");
      return;
    }

    if (existing.status !== "locked") {
      alert("⚠️ Chỉ được chi bảng lương đã chốt.");
      return;
    }

    const method = window.prompt(
      "Phương thức thanh toán:\n\n1 = 💵 Tiền mặt\n2 = 🏦 Chuyển khoản",
      "1"
    );

    if (method === null) return;

    const paymentMethod =
      method.trim() === "1"
        ? "cash"
        : method.trim() === "2"
          ? "transfer"
          : null;

    if (!paymentMethod) {
      alert("❌ Vui lòng chọn 1 hoặc 2.");
      return;
    }

    const ok = window.confirm(
      `💵 XÁC NHẬN CHI LƯƠNG\n\n` +
        `Giáo viên: ${item.teacher.full_name}\n` +
        `Số buổi: ${item.totalSessions}\n` +
        `Số tiền: ${money(item.totalAmount)}\n` +
        `Phương thức: ${
          paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản"
        }\n\n` +
        `Sau khi xác nhận, hệ thống sẽ ghi nhận khoản chi.`
    );

    if (!ok) return;

    setWorking(true);

    const { data, error } = await supabase.rpc("pay_teacher_payroll", {
      p_payroll_id: existing.id,
      p_payment_method: paymentMethod,
    });

    setWorking(false);

    if (error) {
      console.error(error);
      alert("❌ Không thể chi lương.\n\n" + error.message);
      return;
    }

    if (data?.already_paid) {
      alert("🟢 Bảng lương này đã được chi trước đó.");
      await loadData();
      return;
    }

    alert(
      `✅ Đã chi lương ${item.teacher.full_name}.\n\n` +
        `💰 ${money(item.totalAmount)}\n` +
        `📌 Khoản chi đã được ghi vào Chi phí.`
    );

    await loadData();
  }

  async function lockAll() {
    const pending = calculated.filter(
      (item) => !payrollTeacherIds.has(item.teacher.id)
    );

    if (!pending.length) {
      alert("Không còn giáo viên nào chưa chốt.");
      return;
    }

    const total = pending.reduce(
      (sum, item) => sum + item.totalAmount,
      0
    );

    const ok = window.confirm(
      `🔒 CHỐT ${pending.length} GIÁO VIÊN?\n\n` +
        `Tổng lương: ${money(total)}\n\n` +
        `Kiểm tra kỹ trước khi chốt.`
    );

    if (!ok) return;

    for (const item of pending) {
      await createOrUpdateDraft(item);
    }

    await loadData();
    alert("⚠️ Đã tính các bảng lương. Hãy kiểm tra rồi chốt từng giáo viên.");
  }

  const totalSessions = calculated.reduce(
    (sum, item) => sum + item.totalSessions,
    0
  );

  const totalAmount = calculated.reduce(
    (sum, item) => sum + item.totalAmount,
    0
  );

  const lockedCount = payrolls.filter(
    (item) => item.status === "locked" || item.status === "paid"
  ).length;

  if (loading) {
    return (
      <main className="p-6">
        <div className="rounded-3xl bg-white p-8 text-slate-500 shadow-sm">
          Đang tải bảng lương...
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm font-black uppercase tracking-wider text-blue-600">
            👨‍🏫 GIÁO VIÊN
          </div>

          <h1 className="mt-1 text-3xl font-black text-slate-900">
            💰 Lương giáo viên
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Tự tính theo số buổi đã dạy trong tháng.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none"
          />

          <button
            onClick={lockAll}
            disabled={working || calculated.length === 0}
            className="rounded-2xl bg-slate-900 px-5 py-3 font-black text-white shadow-sm disabled:opacity-40"
          >
            🔒 Tính bảng lương
          </button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-400">
            Kỳ lương
          </div>
          <div className="mt-1 text-xl font-black">
            {monthLabel(month)}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-400">
            Giáo viên có dạy
          </div>
          <div className="mt-1 text-3xl font-black">
            {calculated.length}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-400">
            Tổng buổi
          </div>
          <div className="mt-1 text-3xl font-black">
            {totalSessions}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-400">
            Tổng lương
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-600">
            {money(totalAmount)}
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">
                {monthLabel(month)}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Đã chốt: {lockedCount}/{calculated.length}
              </p>
            </div>

            <div className="rounded-2xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
              ⚠️ Kiểm tra trước khi chốt
            </div>
          </div>
        </div>

        {calculated.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            Chưa có điểm danh “Đã dạy” trong tháng này.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {calculated.map((item) => {
              const payroll = payrolls.find(
                (p) => p.teacher_id === item.teacher.id
              );

              const locked =
                payroll?.status === "locked" ||
                payroll?.status === "paid";

              const isExpanded =
                expanded === item.teacher.id;

              return (
                <div key={item.teacher.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-black">
                          {item.teacher.full_name}
                        </div>

                        {payroll?.status === "locked" && (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                            🔒 Đã chốt
                          </span>
                        )}

                        {payroll?.status === "paid" && (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                            💵 Đã chi
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-sm text-slate-400">
                        {money(
                          Number(item.teacher.salary_rate || 0)
                        )}{" "}
                        / buổi
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-400">
                        SỐ BUỔI
                      </div>
                      <div className="text-2xl font-black">
                        {item.totalSessions}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-400">
                        PHẢI TRẢ
                      </div>
                      <div className="text-2xl font-black text-emerald-600">
                        {money(item.totalAmount)}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setExpanded(
                            isExpanded ? null : item.teacher.id
                          )
                        }
                        className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700"
                      >
                        {isExpanded
                          ? "Thu gọn"
                          : "👁 Chi tiết"}
                      </button>

                      {!locked && (
                        <button
                          onClick={() =>
                            lockPayroll(item)
                          }
                          disabled={working}
                          className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                        >
                          🔒 Chốt
                        </button>
                      )}

                      {payroll?.status === "locked" && (
                        <button
                          onClick={() => payPayroll(item)}
                          disabled={working}
                          className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                        >
                          💵 Chi lương
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                      <div className="mb-3 text-sm font-black text-slate-500">
                        CHI TIẾT THEO LỚP
                      </div>

                      <div className="space-y-2">
                        {item.details.map((detail) => (
                          <div
                            key={detail.class_id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3"
                          >
                            <div className="font-bold">
                              {detail.class_name}
                            </div>

                            <div className="text-sm text-slate-500">
                              {detail.sessions} buổi ×{" "}
                              {money(detail.salary_rate)}
                            </div>

                            <div className="font-black">
                              {money(detail.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
