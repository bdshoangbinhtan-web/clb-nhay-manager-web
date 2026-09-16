"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamCurrentMonth } from "@/lib/vietnam-date";

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

type TeacherAttendance = {
  teacher_id: string;
  class_id: string;
  attendance_date: string;
  status: string;
};

type WorkSession = {
  id: string;
  class_id: string;
  session_date: string;
  standing_teacher_id: string;
  actual_teacher_id: string;
  teaching_type: string;
  status: string;
  duration_multiplier: number | null;
  standing_hourly_rate: number | null;
  calculated_amount: number | null;
  substitution_request_id: string | null;
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

type PayrollDetail = {
  id: string;
  payroll_id: string;
  class_id: string;
  sessions: number;
  salary_rate: number;
  amount: number;
  attendance_date: string | null;
  teacher_id: string | null;
  standing_teacher_id: string | null;
  duration_multiplier: number;
  is_substitute: boolean;
  amount_override: boolean;
};

type DisplaySession = {
  id: string;
  classId: string;
  date: string;
  teachingType: "regular" | "substitute";
  standingTeacherId: string;
  standingTeacherName: string;
  hourlyRate: number;
  multiplier: number;
  calculatedAmount: number;
  actualAmount: number;
  override: boolean;
};

type CalculatedTeacher = {
  teacher: Teacher;
  totalSessions: number;
  totalAmount: number;
  sessions: DisplaySession[];
};

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `Tháng ${month}/${year}`;
}

function getLocalMonth() {
  return vietnamCurrentMonth();
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function TeacherPayrollPage() {
  const supabase = useMemo(() => createClient(), []);
  const loadRequestRef = useRef(0);

  const [month, setMonth] = useState(getLocalMonth());
  const monthRef = useRef(month);
  monthRef.current = month;

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [teacherAttendance, setTeacherAttendance] = useState<TeacherAttendance[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [details, setDetails] = useState<PayrollDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Tiền Admin chỉnh riêng từng buổi.
  const [amountEdits, setAmountEdits] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    const requestedMonth = month;

    // Một callback cũ không được phép tải/ghi đè tháng đang xem.
    if (requestedMonth !== monthRef.current) return;

    const requestId = ++loadRequestRef.current;
    setLoading(true);

    const start = `${requestedMonth}-01`;
    const [year, monthNumber] = requestedMonth.split("-").map(Number);

    const lastDay = new Date(year, monthNumber, 0);
    const lastDayString =
      `${lastDay.getFullYear()}-` +
      `${String(lastDay.getMonth() + 1).padStart(2, "0")}-` +
      `${String(lastDay.getDate()).padStart(2, "0")}`;

    const [teachersRes, classesRes, workRes, attendanceRes, payrollRes] =
      await Promise.all([
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
          .from("teacher_work_sessions")
          .select(
            `
              id,
              class_id,
              session_date,
              standing_teacher_id,
              actual_teacher_id,
              teaching_type,
              status,
              duration_multiplier,
              standing_hourly_rate,
              calculated_amount,
              substitution_request_id
            `
          )
          .gte("session_date", start)
          .lte("session_date", lastDayString),

        // NGUỒN XÁC NHẬN CHÍNH THỨC CỦA GIÁO VIÊN
        supabase
          .from("teacher_attendance")
          .select("teacher_id,class_id,attendance_date,status")
          .gte("attendance_date", start)
          .lte("attendance_date", lastDayString)
          .eq("status", "taught"),

        supabase
          .from("teacher_payrolls")
          .select(
            "id,teacher_id,payroll_month,total_sessions,salary_rate,total_amount,status"
          )
          .eq("payroll_month", start),
      ]);

    if (
      requestId !== loadRequestRef.current ||
      requestedMonth !== monthRef.current
    ) {
      return;
    }

    if (teachersRes.error) {
      console.error(teachersRes.error);
      alert("❌ Không tải được danh sách giáo viên.");
    }

    if (classesRes.error) {
      console.error(classesRes.error);
      alert("❌ Không tải được danh sách lớp.");
    }

    if (workRes.error) {
      console.error(workRes.error);
      alert(
        "❌ Không tải được dữ liệu buổi dạy.\n\n" +
          workRes.error.message
      );
    }

    if (attendanceRes.error) {
      console.error(attendanceRes.error);
      alert(
        "❌ Không tải được xác nhận dạy của giáo viên.\n\n" +
          attendanceRes.error.message
      );
    }

    if (payrollRes.error) {
      console.error(payrollRes.error);
      alert(
        "❌ Không tải được bảng lương.\n\n" +
          payrollRes.error.message
      );
    }

    const nextTeachers = teachersRes.data ?? [];
    const nextClasses = classesRes.data ?? [];
    const nextPayrolls = payrollRes.data ?? [];

    setTeachers(nextTeachers);
    setClasses(nextClasses);
    setWorkSessions(workRes.data ?? []);
    setTeacherAttendance(attendanceRes.data ?? []);
    setPayrolls(nextPayrolls);

    // Lấy chi tiết của các bảng lương đã tồn tại.
    if (nextPayrolls.length > 0) {
      const payrollIds = nextPayrolls.map((item) => item.id);

      const { data: detailData, error: detailError } = await supabase
        .from("teacher_payroll_details")
        .select(
          `
            id,
            payroll_id,
            class_id,
            sessions,
            salary_rate,
            amount,
            attendance_date,
            teacher_id,
            standing_teacher_id,
            duration_multiplier,
            is_substitute,
            amount_override
          `
        )
        .in("payroll_id", payrollIds);

      if (
        requestId !== loadRequestRef.current ||
        requestedMonth !== monthRef.current
      ) {
        return;
      }

      if (detailError) {
        console.error(detailError);
        alert(
          "❌ Không tải được chi tiết bảng lương.\n\n" +
            detailError.message
        );
      }

      setDetails(detailData ?? []);
    } else {
      setDetails([]);
    }

    if (
      requestId === loadRequestRef.current &&
      requestedMonth === monthRef.current
    ) {
      setLoading(false);
    }
  }, [month, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const classMap = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes]
  );

  const teacherMap = useMemo(
    () => new Map(teachers.map((item) => [item.id, item.full_name])),
    [teachers]
  );

  const payrollMap = useMemo(
    () => new Map(payrolls.map((item) => [item.teacher_id, item])),
    [payrolls]
  );

  // Chỉ buổi có teacher_attendance.status = taught mới được tính lương.
  // teacher_work_sessions.status có thể còn pending nên KHÔNG dùng nó
  // làm điều kiện xác nhận lương.
  const confirmedAttendanceKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const row of teacherAttendance) {
      if (row.status !== "taught") continue;
      keys.add(
        `${row.teacher_id}|${row.class_id}|${row.attendance_date}`
      );
    }

    return keys;
  }, [teacherAttendance]);

  const detailMap = useMemo(() => {
    const map = new Map<string, PayrollDetail>();

    for (const detail of details) {
      if (!detail.attendance_date || !detail.teacher_id) continue;

      const key =
        `${detail.teacher_id}|` +
        `${detail.class_id}|` +
        `${detail.attendance_date}`;

      map.set(key, detail);
    }

    return map;
  }, [details]);

  const calculated = useMemo(() => {
    const map = new Map<string, CalculatedTeacher>();

    for (const session of workSessions) {
      const attendanceKey =
        `${session.actual_teacher_id}|` +
        `${session.class_id}|` +
        `${session.session_date}`;

      // CHƯA XÁC NHẬN "ĐÃ DẠY" -> KHÔNG TÍNH LƯƠNG
      if (!confirmedAttendanceKeys.has(attendanceKey)) {
        continue;
      }

      const teacher = teachers.find(
        (item) => item.id === session.actual_teacher_id
      );

      if (!teacher) continue;

      const payroll = payrollMap.get(teacher.id);

      // Bảng đã chốt/đã chi không được tính lại từ dữ liệu mới.
      if (payroll?.status === "locked" || payroll?.status === "paid") {
        continue;
      }

      const multiplier = Number(session.duration_multiplier ?? 1);

      const hourlyRate =
        Number(session.standing_hourly_rate ?? 0) ||
        Number(teacher.salary_rate ?? 0);

      const calculatedAmount =
        Number(session.calculated_amount ?? 0) ||
        hourlyRate * multiplier;

      const detailKey =
        `${session.actual_teacher_id}|` +
        `${session.class_id}|` +
        `${session.session_date}`;

      const savedDetail = detailMap.get(detailKey);

      const editValue = amountEdits[session.id];

      const actualAmount =
        editValue !== undefined
          ? Number(editValue || 0)
          : savedDetail?.amount_override
            ? Number(savedDetail.amount)
            : calculatedAmount;

      const displaySession: DisplaySession = {
        id: session.id,
        classId: session.class_id,
        date: session.session_date,
        teachingType:
          session.teaching_type === "substitute"
            ? "substitute"
            : "regular",
        standingTeacherId: session.standing_teacher_id,
        standingTeacherName:
          teacherMap.get(session.standing_teacher_id) ?? "Không xác định",
        hourlyRate,
        multiplier,
        calculatedAmount,
        actualAmount,
        override:
          editValue !== undefined ||
          Boolean(savedDetail?.amount_override),
      };

      if (!map.has(teacher.id)) {
        map.set(teacher.id, {
          teacher,
          totalSessions: 0,
          totalAmount: 0,
          sessions: [],
        });
      }

      const item = map.get(teacher.id)!;

      item.totalSessions += 1;
      item.totalAmount += actualAmount;
      item.sessions.push(displaySession);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.teacher.full_name.localeCompare(b.teacher.full_name, "vi")
    );
  }, [
    workSessions,
    confirmedAttendanceKeys,
    teachers,
    payrollMap,
    detailMap,
    amountEdits,
    teacherMap,
  ]);

  // Giáo viên đã có bảng lương locked/paid được lấy trực tiếp từ bảng lương.
  const lockedTeachers = useMemo(() => {
    return teachers
      .map((teacher) => {
        const payroll = payrollMap.get(teacher.id);

        if (
          !payroll ||
          (payroll.status !== "locked" && payroll.status !== "paid")
        ) {
          return null;
        }

        const teacherDetails = details.filter(
          (detail) => detail.payroll_id === payroll.id
        );

        const sessions: DisplaySession[] = teacherDetails.map(
          (detail, index) => ({
            id: `detail-${detail.id}-${index}`,
            classId: detail.class_id,
            date:
              detail.attendance_date ??
              `${month}-01`,
            teachingType: detail.is_substitute
              ? "substitute"
              : "regular",
            standingTeacherId:
              detail.standing_teacher_id ?? teacher.id,
            standingTeacherName:
              teacherMap.get(
                detail.standing_teacher_id ?? teacher.id
              ) ?? teacher.full_name,
            hourlyRate: Number(detail.salary_rate || 0),
            multiplier: Number(detail.duration_multiplier || 1),
            calculatedAmount:
              Number(detail.salary_rate || 0) *
              Number(detail.duration_multiplier || 1),
            actualAmount: Number(detail.amount || 0),
            override: Boolean(detail.amount_override),
          })
        );

        return {
          teacher,
          totalSessions: payroll.total_sessions,
          totalAmount: payroll.total_amount,
          sessions,
          payroll,
        };
      })
      .filter(Boolean) as Array<
      CalculatedTeacher & { payroll: Payroll }
    >;
  }, [teachers, payrollMap, details, teacherMap, month]);

  const rows = useMemo(() => {
    const map = new Map<string, CalculatedTeacher & { payroll?: Payroll }>();

    for (const item of calculated) {
      map.set(item.teacher.id, {
        ...item,
        payroll: payrollMap.get(item.teacher.id),
      });
    }

    for (const item of lockedTeachers) {
      map.set(item.teacher.id, item);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.teacher.full_name.localeCompare(b.teacher.full_name, "vi")
    );
  }, [calculated, lockedTeachers, payrollMap]);

  function setEditedAmount(sessionId: string, value: string) {
    setAmountEdits((current) => ({
      ...current,
      [sessionId]: value,
    }));
  }

  async function savePayroll(
    item: CalculatedTeacher,
    targetStatus: "draft" | "locked"
  ) {
    setWorking(true);

    try {
      const { data, error } = await supabase.rpc("save_teacher_payroll_atomic", {
        p_teacher_id: item.teacher.id,
        p_payroll_month: `${month}-01`,
        p_target_status: targetStatus,
        p_details: item.sessions.map((session) => ({
          class_id: session.classId,
          attendance_date: session.date,
          amount: session.actualAmount,
        })),
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error("Máy chủ chưa xác nhận lưu bảng lương thành công.");
      }

      alert(
        data.already_locked
          ? "🔒 Bảng lương này đã được chốt trước đó."
          : targetStatus === "draft"
            ? `✅ Đã lưu bảng lương nháp cho ${item.teacher.full_name}.`
            : `🔒 Đã chốt lương ${item.teacher.full_name}.`
      );
      await loadData();
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Đã xảy ra lỗi không xác định.";
      alert(
        (targetStatus === "draft"
          ? "❌ Không thể lưu bảng lương nháp.\n\n"
          : "❌ Không thể chốt lương.\n\n") + message
      );
    } finally {
      setWorking(false);
    }
  }

  async function saveDraft(item: CalculatedTeacher) {
    const existing = payrollMap.get(item.teacher.id);

    if (existing?.status === "locked" || existing?.status === "paid") {
      alert("🔒 Bảng lương này đã chốt, không thể sửa.");
      return;
    }

    await savePayroll(item, "draft");
  }

  async function lockPayroll(item: CalculatedTeacher) {
    const existing = payrollMap.get(item.teacher.id);

    if (existing?.status === "paid") {
      alert("Bảng lương này đã được chi.");
      return;
    }

    const ok = window.confirm(
      `🔒 CHỐT LƯƠNG ${item.teacher.full_name}?\n\n` +
        `${item.totalSessions} buổi\n` +
        `Tổng: ${money(item.totalAmount)}\n\n` +
        `Sau khi chốt, giáo viên mới được xem số tiền lương.`
    );

    if (!ok) return;

    await savePayroll(item, "locked");
  }

  async function unlockPayroll(item: CalculatedTeacher & { payroll?: Payroll }) {
    const payroll = payrollMap.get(item.teacher.id);

    if (!payroll) return;

    if (payroll.status === "paid") {
      alert("❌ Bảng lương đã chi, không thể mở khóa.");
      return;
    }

    if (payroll.status !== "locked") {
      alert("Bảng lương chưa ở trạng thái đã chốt.");
      return;
    }

    const ok = window.confirm(
      `🔓 MỞ KHÓA LƯƠNG ${item.teacher.full_name}?\n\n` +
        `Sau khi mở khóa, Admin có thể sửa lại từng buổi.`
    );

    if (!ok) return;

    setWorking(true);

    const { error } = await supabase
      .from("teacher_payrolls")
      .update({
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payroll.id);

    setWorking(false);

    if (error) {
      alert("❌ Không thể mở khóa.\n\n" + error.message);
      return;
    }

    alert(`🔓 Đã mở khóa lương ${item.teacher.full_name}.`);
    await loadData();
  }

  async function payPayroll(item: CalculatedTeacher) {
    const payroll = payrollMap.get(item.teacher.id);

    if (!payroll) {
      alert("⚠️ Bảng lương chưa được chốt.");
      return;
    }

    if (payroll.status === "paid") {
      alert("🟢 Bảng lương này đã được chi.");
      return;
    }

    if (payroll.status !== "locked") {
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
      p_payroll_id: payroll.id,
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

  const totalSessions = rows.reduce(
    (sum, item) => sum + item.totalSessions,
    0
  );

  const totalAmount = rows.reduce(
    (sum, item) => sum + item.totalAmount,
    0
  );

  const lockedCount = rows.filter((item) => {
    const payroll = payrollMap.get(item.teacher.id);
    return payroll?.status === "locked" || payroll?.status === "paid";
  }).length;

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
            <div className="flex flex-wrap items-center gap-3">
              <span>💰 Lương giáo viên</span>

              <a
                href="/teacher-payroll/substitution"
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                🔄 Duyệt dạy thay
              </a>
            </div>
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Tính theo buổi dạy thực tế, thời lượng lớp và mức lương theo giờ.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none"
          />
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
            {rows.length}
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
                Đã chốt: {lockedCount}/{rows.length}
              </p>
            </div>

            <div className="rounded-2xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
              ⚠️ Kiểm tra từng buổi trước khi chốt
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            Chưa có buổi dạy được ghi nhận trong tháng này.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((item) => {
              const payroll = payrollMap.get(item.teacher.id);

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
                        {money(Number(item.teacher.salary_rate || 0))}
                        {" / giờ"}
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

                    <div className="flex flex-wrap gap-2">
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
                        <>
                          <button
                            onClick={() => saveDraft(item)}
                            disabled={working}
                            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                          >
                            💾 Lưu
                          </button>

                          <button
                            onClick={() => lockPayroll(item)}
                            disabled={working}
                            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                          >
                            🔒 Chốt
                          </button>
                        </>
                      )}

                      {payroll?.status === "locked" && (
                        <>
                          <button
                            onClick={() => unlockPayroll(item)}
                            disabled={working}
                            className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                          >
                            🔓 Mở khóa
                          </button>

                          <button
                            onClick={() => payPayroll(item)}
                            disabled={working}
                            className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                          >
                            💵 Chi lương
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                      <div className="mb-4 text-sm font-black text-slate-500">
                        CHI TIẾT TỪNG BUỔI
                      </div>

                      <div className="space-y-3">
                        {item.sessions.map((session) => (
                          <div
                            key={session.id}
                            className="rounded-2xl bg-white p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div>
                                <div className="font-black">
                                  {formatDate(session.date)}
                                </div>

                                <div className="mt-1 font-bold text-slate-700">
                                  {classMap.get(session.classId) ??
                                    "Lớp không xác định"}
                                </div>

                                <div className="mt-1 text-sm text-slate-500">
                                  {session.teachingType ===
                                  "substitute" ? (
                                    <>
                                      🔄 Dạy thay · GV đứng lớp:{" "}
                                      <b>
                                        {session.standingTeacherName}
                                      </b>
                                    </>
                                  ) : (
                                    <>👨‍🏫 Dạy chính thức</>
                                  )}
                                </div>
                              </div>

                              <div className="text-sm text-slate-500">
                                <div>
                                  Rate:{" "}
                                  <b>
                                    {money(session.hourlyRate)}
                                  </b>
                                  /giờ
                                </div>

                                <div>
                                  Hệ số:{" "}
                                  <b>{session.multiplier}x</b>
                                </div>

                                <div>
                                  Mặc định:{" "}
                                  <b>
                                    {money(
                                      session.calculatedAmount
                                    )}
                                  </b>
                                </div>
                              </div>

                              <div className="min-w-[220px]">
                                <div className="text-xs font-black text-slate-400">
                                  TIỀN THỰC TẾ
                                </div>

                                {locked ? (
                                  <div className="mt-1 text-xl font-black text-emerald-600">
                                    {money(session.actualAmount)}
                                  </div>
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    step="1000"
                                    value={
                                      amountEdits[session.id] ??
                                      String(
                                        session.actualAmount
                                      )
                                    }
                                    onChange={(e) =>
                                      setEditedAmount(
                                        session.id,
                                        e.target.value
                                      )
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-black outline-none focus:border-blue-500"
                                  />
                                )}

                                {session.override && (
                                  <div className="mt-1 text-xs font-bold text-amber-600">
                                    ✏️ Admin đã chỉnh riêng buổi này
                                  </div>
                                )}
                              </div>
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
