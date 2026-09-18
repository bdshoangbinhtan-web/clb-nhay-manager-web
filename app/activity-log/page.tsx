"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ActivityLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type SimpleEntity = {
  id: string;
  student_code?: string | null;
  full_name?: string | null;
  name?: string | null;
};

type TuitionSummary = {
  id: string;
  student_id: string;
  amount_due: number;
  amount_paid: number;
  billing_month: string;
};

const entityNames: Record<string, string> = {
  students: "Học viên",
  teachers: "Giáo viên",
  classes: "Lớp học",
  branches: "Cơ sở",
  attendance: "Điểm danh",
  teacher_attendance: "Điểm danh giáo viên",
  teacher_payrolls: "Lương giáo viên",
  expenses: "Chi phí",
  tuition: "Học phí",
  tuition_payments: "Thu học phí",
  profiles: "Tài khoản",
};

const fieldNames: Record<string, string> = {
  full_name: "Họ và tên",
  student_code: "Mã học viên",
  parent_phone: "SĐT phụ huynh",
  phone: "Số điện thoại",
  email: "Email",
  branch_id: "Cơ sở",
  status: "Trạng thái",
  join_date: "Ngày vào học",
  start_date: "Ngày bắt đầu",
  end_date: "Ngày kết thúc",
  monthly_fee: "Học phí tháng",
  amount: "Số tiền",
  category: "Danh mục",
  description: "Nội dung",
  note: "Ghi chú",
  salary_rate: "Mức lương",
  total_amount: "Tổng tiền",
  total_sessions: "Số buổi",
  payment_method: "Phương thức thanh toán",
  payroll_month: "Tháng lương",
  role: "Quyền",
};

function fieldLabel(key: string) {
  return (
    fieldNames[key] ||
    key
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Có" : "Không";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) >= 1000
  ) {
    return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
  }

  return String(value);
}

function actionInfo(action: ActivityLog["action"]) {
  if (action === "INSERT") {
    return {
      icon: "➕",
      label: "Thêm mới",
      className: "bg-emerald-50 text-emerald-700",
    };
  }

  if (action === "DELETE") {
    return {
      icon: "🗑️",
      label: "Xóa",
      className: "bg-rose-50 text-rose-700",
    };
  }

  return {
    icon: "✏️",
    label: "Cập nhật",
    className: "bg-blue-50 text-blue-700",
  };
}

function changedFields(log: ActivityLog) {
  if (log.action !== "UPDATE") return [];

  const oldData = log.old_data || {};
  const newData = log.new_data || {};

  const keys = Array.from(
    new Set([...Object.keys(oldData), ...Object.keys(newData)])
  );

  return keys
    .filter((key) => {
      if (["id", "created_at", "updated_at"].includes(key)) return false;

      return JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]);
    })
    .map((key) => ({
      key,
      oldValue: oldData[key],
      newValue: newData[key],
    }));
}

export default function ActivityLogPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [students, setStudents] = useState<SimpleEntity[]>([]);
  const [teachers, setTeachers] = useState<SimpleEntity[]>([]);
  const [classes, setClasses] = useState<SimpleEntity[]>([]);
  const [branches, setBranches] = useState<SimpleEntity[]>([]);
  const [tuition, setTuition] = useState<TuitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.push("/login");
        return;
      }

      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

      if (currentProfile?.role !== "admin") {
        router.push("/dashboard");
        return;
      }

      const logsRes = await supabase
        .from("activity_logs")
        .select(
          "id,created_at,user_id,action,entity_type,entity_id,old_data,new_data"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (cancelled) return;

      if (logsRes.error) {
        console.error(
          "ACTIVITY LOG ERROR:",
          logsRes.error.message,
          logsRes.error.code,
          logsRes.error.details,
          logsRes.error.hint
        );
        alert(
          `Activity Log lỗi:\n${logsRes.error.message}\nCode: ${
            logsRes.error.code || "N/A"
          }`
        );
        setLoading(false);
        return;
      }

      const nextLogs = (logsRes.data as ActivityLog[]) ?? [];
      const profileIds = new Set<string>();
      const studentIds = new Set<string>();
      const teacherIds = new Set<string>();
      const classIds = new Set<string>();
      const branchIds = new Set<string>();
      const tuitionIds = new Set<string>();

      const addId = (set: Set<string>, value: unknown) => {
        if (typeof value === "string" && value) set.add(value);
      };

      for (const log of nextLogs) {
        addId(profileIds, log.user_id);

        if (log.entity_type === "profiles") addId(profileIds, log.entity_id);
        if (log.entity_type === "students") addId(studentIds, log.entity_id);
        if (log.entity_type === "teachers") addId(teacherIds, log.entity_id);
        if (log.entity_type === "classes") addId(classIds, log.entity_id);
        if (log.entity_type === "branches") addId(branchIds, log.entity_id);
        if (log.entity_type === "tuition") addId(tuitionIds, log.entity_id);

        for (const data of [log.old_data, log.new_data]) {
          if (!data) continue;
          addId(studentIds, data.student_id);
          addId(teacherIds, data.teacher_id);
          addId(teacherIds, data.actual_teacher_id);
          addId(teacherIds, data.standing_teacher_id);
          addId(classIds, data.class_id);
          addId(branchIds, data.branch_id);
          addId(tuitionIds, data.tuition_id);
        }
      }

      const tuitionRes = tuitionIds.size
        ? await supabase
            .from("tuition")
            .select("id,student_id,amount_due,amount_paid,billing_month")
            .in("id", Array.from(tuitionIds))
        : { data: [], error: null };

      if (cancelled) return;

      for (const item of tuitionRes.data ?? []) {
        addId(studentIds, item.student_id);
      }

      const [profilesRes, studentsRes, teachersRes, classesRes, branchesRes] =
        await Promise.all([
          profileIds.size
            ? supabase
                .from("profiles")
                .select("id,full_name,role")
                .in("id", Array.from(profileIds))
                .order("full_name")
            : Promise.resolve({ data: [], error: null }),
          studentIds.size
            ? supabase
                .from("students")
                .select("id,student_code,full_name")
                .in("id", Array.from(studentIds))
            : Promise.resolve({ data: [], error: null }),
          teacherIds.size
            ? supabase
                .from("teachers")
                .select("id,full_name")
                .in("id", Array.from(teacherIds))
            : Promise.resolve({ data: [], error: null }),
          classIds.size
            ? supabase
                .from("classes")
                .select("id,name")
                .in("id", Array.from(classIds))
            : Promise.resolve({ data: [], error: null }),
          branchIds.size
            ? supabase
                .from("branches")
                .select("id,name")
                .in("id", Array.from(branchIds))
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (cancelled) return;

      const relatedError = [
        tuitionRes.error,
        profilesRes.error,
        studentsRes.error,
        teachersRes.error,
        classesRes.error,
        branchesRes.error,
      ].find(Boolean);

      if (relatedError) {
        console.error("Không tải được tên đối tượng trong nhật ký:", relatedError);
      }

      setLogs(nextLogs);
      setProfiles(profilesRes.data ?? []);
      setStudents(studentsRes.data ?? []);
      setTeachers(teachersRes.data ?? []);
      setClasses(classesRes.data ?? []);
      setBranches(branchesRes.data ?? []);
      setTuition((tuitionRes.data as TuitionSummary[]) ?? []);
      setLoading(false);
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const profileMap = useMemo(
    () => new Map(profiles.map((item) => [item.id, item])),
    [profiles]
  );

  const studentMap = useMemo(
    () =>
      new Map(
        students.map((item) => [
          item.id,
          item.student_code
            ? `${item.full_name} · ${item.student_code}`
            : item.full_name,
        ])
      ),
    [students]
  );

  const teacherMap = useMemo(
    () => new Map(teachers.map((item) => [item.id, item.full_name])),
    [teachers]
  );

  const classMap = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes]
  );

  const branchMap = useMemo(
    () => new Map(branches.map((item) => [item.id, item.name])),
    [branches]
  );

  const tuitionMap = useMemo(
    () => new Map(tuition.map((item) => [item.id, item])),
    [tuition]
  );

  function getEntityLabel(log: ActivityLog) {
    const data = log.new_data || log.old_data || {};

    if (log.entity_type === "students") {
      return studentMap.get(log.entity_id || "") || "Học viên";
    }

    if (log.entity_type === "teachers") {
      return teacherMap.get(log.entity_id || "") || "Giáo viên";
    }

    if (log.entity_type === "classes") {
      return classMap.get(log.entity_id || "") || "Lớp học";
    }

    if (log.entity_type === "branches") {
      return branchMap.get(log.entity_id || "") || "Cơ sở";
    }

    if (log.entity_type === "attendance") {
      const studentName = studentMap.get(String(data.student_id ?? ""));
      const className = classMap.get(String(data.class_id ?? ""));

      if (studentName && className) {
        return `${studentName} — ${className}`;
      }

      return "Bản ghi điểm danh";
    }

    if (log.entity_type === "teacher_attendance") {
      const teacherName = teacherMap.get(String(data.teacher_id ?? ""));
      const className = classMap.get(String(data.class_id ?? ""));

      if (teacherName && className) {
        return `${teacherName} — ${className}`;
      }

      return "Bản ghi điểm danh GV";
    }

    if (log.entity_type === "teacher_payrolls") {
      const teacherName = teacherMap.get(String(data.teacher_id ?? ""));

      if (teacherName) {
        return teacherName;
      }

      return "Bảng lương giáo viên";
    }

    if (log.entity_type === "tuition") {
      const tuitionItem = tuitionMap.get(log.entity_id || "");
      const studentName = studentMap.get(tuitionItem?.student_id || "");

      return studentName
        ? `${studentName} — Học phí ${tuitionItem?.billing_month?.slice(0, 7) || ""}`
        : "Khoản học phí";
    }

    if (log.entity_type === "tuition_payments") {
      const tuitionId = String(data.tuition_id ?? "");
      const tuitionItem = tuitionMap.get(tuitionId || "");
      const studentName = studentMap.get(tuitionItem?.student_id || "");

      return studentName || "Thu học phí";
    }

    if (log.entity_type === "expenses") {
      return String(data.description ?? data.category ?? "Khoản chi");
    }

    if (log.entity_type === "profiles") {
      return profileMap.get(log.entity_id || "")?.full_name || "Tài khoản";
    }

    return entityNames[log.entity_type] || log.entity_type;
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const actionOk =
        actionFilter === "all" || log.action === actionFilter;

      const entityOk =
        entityFilter === "all" || log.entity_type === entityFilter;

      const userOk =
        userFilter === "all" || log.user_id === userFilter;

      return actionOk && entityOk && userOk;
    });
  }, [logs, actionFilter, entityFilter, userFilter]);

  // Một lần "Thu tiền" tạo 2 log kỹ thuật:
  // INSERT tuition_payments + UPDATE tuition.
  // Giao diện chỉ hiển thị 1 hành động nghiệp vụ "Thu học phí".
  const visibleLogs = useMemo(() => {
    return filteredLogs.filter((log) => {
      if (log.entity_type !== "tuition" || log.action !== "UPDATE") {
        return true;
      }

      return !logs.some((paymentLog) => {
        if (
          paymentLog.entity_type !== "tuition_payments" ||
          paymentLog.action !== "INSERT" ||
          paymentLog.user_id !== log.user_id
        ) {
          return false;
        }

        const paymentData = paymentLog.new_data || {};
        const sameTuition =
          paymentData.tuition_id === log.entity_id;

        const timeDiff = Math.abs(
          new Date(paymentLog.created_at).getTime() -
            new Date(log.created_at).getTime()
        );

        return sameTuition && timeDiff <= 3000;
      });
    });
  }, [filteredLogs, logs]);

  const stats = useMemo(
    () => ({
      total: visibleLogs.length,
      updates: visibleLogs.filter((x) => x.action === "UPDATE").length,
      inserts: visibleLogs.filter((x) => x.action === "INSERT").length,
      deletes: visibleLogs.filter((x) => x.action === "DELETE").length,
    }),
    [visibleLogs]
  );

  if (loading) {
    return (
      <div className="ui-card p-12 text-center text-slate-400">
        Đang tải lịch sử hoạt động...
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* HEADER */}
      <section>
        <div className="text-sm font-bold uppercase tracking-wider text-blue-600">
          🕵️ QUẢN TRỊ HỆ THỐNG
        </div>

        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Lịch sử hoạt động
            </h1>

            <p className="mt-2 text-sm text-slate-500 sm:text-base">
              Theo dõi mọi thay đổi quan trọng được thực hiện trong hệ thống.
            </p>
          </div>

          <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            👑 Chỉ Admin
          </div>
        </div>
      </section>

      {/* SUMMARY */}
      <section className="grid gap-4 sm:grid-cols-4">
        <div className="ui-card p-5">
          <div className="text-sm font-semibold text-slate-400">
            Tổng hoạt động
          </div>
          <div className="mt-2 text-3xl font-black">{stats.total}</div>
        </div>

        <div className="ui-card p-5">
          <div className="text-sm font-semibold text-slate-400">
            ✏️ Cập nhật
          </div>
          <div className="mt-2 text-3xl font-black text-blue-700">
            {stats.updates}
          </div>
        </div>

        <div className="ui-card p-5">
          <div className="text-sm font-semibold text-slate-400">
            ➕ Thêm mới
          </div>
          <div className="mt-2 text-3xl font-black text-emerald-700">
            {stats.inserts}
          </div>
        </div>

        <div className="ui-card p-5">
          <div className="text-sm font-semibold text-slate-400">
            🗑️ Đã xóa
          </div>
          <div className="mt-2 text-3xl font-black text-rose-700">
            {stats.deletes}
          </div>
        </div>
      </section>

      {/* FILTERS */}
      <section className="ui-card p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="ui-input"
          >
            <option value="all">⚡ Tất cả hành động</option>
            <option value="INSERT">➕ Thêm mới</option>
            <option value="UPDATE">✏️ Cập nhật</option>
            <option value="DELETE">🗑️ Xóa</option>
          </select>

          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="ui-input"
          >
            <option value="all">📦 Tất cả đối tượng</option>

            {Object.entries(entityNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="ui-input"
          >
            <option value="all">👤 Tất cả người dùng</option>

            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name || "Chưa đặt tên"}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* LOG LIST */}
      <section className="ui-card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-xl font-black">📋 Nhật ký hệ thống</h2>
          <p className="mt-1 text-sm text-slate-400">
            {visibleLogs.length} hoạt động đang hiển thị
          </p>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <div className="text-5xl">🕵️</div>
            <div className="mt-4 font-black">
              Không có hoạt động phù hợp
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleLogs.map((log) => {
              const info = actionInfo(log.action);
              const profile = log.user_id
                ? profileMap.get(log.user_id)
                : null;

              const changes = changedFields(log);

              return (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="block w-full text-left transition hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                    <div className="shrink-0 text-xs font-semibold text-slate-400 lg:w-[150px]">
                      {new Date(log.created_at).toLocaleString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </div>

                    <div
                    className={`flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${
                      log.entity_type === "tuition_payments"
                        ? "bg-emerald-50 text-emerald-700"
                        : info.className
                    }`}
                  >
                    <span>
                      {log.entity_type === "tuition_payments"
                        ? "💰"
                        : info.icon}
                    </span>
                    {log.entity_type === "tuition_payments"
                      ? "Thu học phí"
                      : info.label}
                  </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-black text-slate-900">
                        {getEntityLabel(log)}
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        {log.entity_type === "tuition_payments"
                          ? "Giao dịch thu tiền"
                          : entityNames[log.entity_type] || log.entity_type}

                        {changes.length > 0 && (
                          <span className="ml-2">
                            · {changes.length} thay đổi
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-sm font-bold text-slate-600">
                      👤 {profile?.full_name || "Tài khoản không xác định"}
                    </div>

                    <div className="text-slate-300">›</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* DETAIL MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  CHI TIẾT HOẠT ĐỘNG
                </div>

                <h2 className="mt-1 text-2xl font-black">
                  {getEntityLabel(selectedLog)}
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  {new Date(selectedLog.created_at).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </p>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-6">
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase text-slate-400">
                    Người thực hiện
                  </div>
                  <div className="mt-1 font-black">
                    {selectedLog.user_id
                      ? profileMap.get(selectedLog.user_id)?.full_name ||
                        "Không xác định"
                      : "Không xác định"}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase text-slate-400">
                    Hành động
                  </div>
                  <div className="mt-1 font-black">
                    {actionInfo(selectedLog.action).icon}{" "}
                    {actionInfo(selectedLog.action).label}
                  </div>
                </div>
              </div>

              {selectedLog.entity_type === "tuition_payments" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-50 p-5">
                    <div className="text-xs font-bold uppercase text-emerald-600">
                      Số tiền thu
                    </div>
                    <div className="mt-2 text-3xl font-black text-emerald-700">
                      {formatValue(selectedLog.new_data?.amount)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5">
                    <div className="text-xs font-bold uppercase text-slate-400">
                      Học viên
                    </div>
                    <div className="mt-2 font-black">
                      {getEntityLabel(selectedLog)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5">
                    <div className="text-xs font-bold uppercase text-slate-400">
                      Ngày thu
                    </div>
                    <div className="mt-2 font-semibold">
                      {formatValue(selectedLog.new_data?.payment_date)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5">
                    <div className="text-xs font-bold uppercase text-slate-400">
                      Phương thức
                    </div>
                    <div className="mt-2 font-semibold">
                      {formatValue(
                        selectedLog.new_data?.method ||
                          selectedLog.new_data?.payment_method
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5 sm:col-span-2">
                    <div className="text-xs font-bold uppercase text-slate-400">
                      Ghi chú
                    </div>
                    <div className="mt-2 font-semibold">
                      {formatValue(selectedLog.new_data?.note)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5 sm:col-span-2">
                    <div className="text-xs font-bold uppercase text-slate-400">
                      Số biên lai
                    </div>
                    <div className="mt-2 font-semibold">
                      {formatValue(selectedLog.new_data?.receipt_no)}
                    </div>
                  </div>
                </div>
              ) : selectedLog.action === "UPDATE" ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[1fr_1fr_1fr] border-b bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-400">
                    <div>Trường</div>
                    <div>Trước</div>
                    <div>Sau</div>
                  </div>

                  {changedFields(selectedLog).map((change) => (
                    <div
                      key={change.key}
                      className="grid grid-cols-[1fr_1fr_1fr] border-b border-slate-100 px-4 py-4 text-sm last:border-0"
                    >
                      <div className="font-black">
                        {fieldLabel(change.key)}
                      </div>

                      <div className="break-words text-rose-600">
                        {formatValue(change.oldValue)}
                      </div>

                      <div className="break-words font-bold text-emerald-700">
                        {formatValue(change.newValue)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(
                    selectedLog.action === "DELETE"
                      ? selectedLog.old_data || {}
                      : selectedLog.new_data || {}
                  )
                    .filter(
                      ([key]) =>
                        !["id", "created_at", "updated_at"].includes(key)
                    )
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className="rounded-2xl bg-slate-50 p-4"
                      >
                        <div className="text-xs font-bold uppercase text-slate-400">
                          {fieldLabel(key)}
                        </div>

                        <div className="mt-1 break-words font-semibold">
                          {formatValue(value)}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-100 p-5">
              <button
                onClick={() => setSelectedLog(null)}
                className="ui-btn ui-btn-light"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
