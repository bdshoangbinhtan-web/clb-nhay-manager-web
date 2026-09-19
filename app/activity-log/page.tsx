"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { vietnamCurrentMonth } from "@/lib/vietnam-date";

type BusinessGroup = "finance" | "teachers" | "students" | "classes" | "system";

type ActivityLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  branch_id: string | null;
  business_group: BusinessGroup;
  actor_name: string | null;
  actor_role: string | null;
  branch_name: string | null;
};

type Profile = { id: string; full_name: string | null; role: string | null };
type Branch = { id: string; name: string };
type SimpleEntity = { id: string; student_code?: string | null; full_name?: string | null; name?: string | null };
type TuitionSummary = { id: string; student_id: string; amount_due: number; amount_paid: number; billing_month: string };
type ActivityStats = { total: number; inserts: number; updates: number; deletes: number };
type ActivityPageResult = { rows: ActivityLog[]; stats: ActivityStats; page: number; page_size: number; has_more: boolean };

const PAGE_SIZE = 50;

const entityNames: Record<string, string> = {
  students: "Học viên",
  trial_students: "Học viên học thử",
  trial_class_leads: "Đăng ký học thử",
  teachers: "Giáo viên",
  classes: "Lớp học",
  class_sessions: "Buổi học",
  class_students: "Xếp lớp học viên",
  class_teachers: "Phân công giáo viên",
  branches: "Cơ sở",
  attendance: "Điểm danh học viên",
  teacher_attendance: "Điểm danh giáo viên",
  teacher_work_sessions: "Buổi công giáo viên",
  teacher_substitution_requests: "Yêu cầu dạy thay",
  teacher_payrolls: "Bảng lương giáo viên",
  teacher_payroll_details: "Chi tiết lương giáo viên",
  expenses: "Chi phí",
  other_revenues: "Thu khác",
  tuition: "Học phí",
  tuition_payments: "Thu học phí",
  tuition_adjustments: "Điều chỉnh học phí",
  profiles: "Tài khoản",
};

const groupInfo: Record<BusinessGroup, { label: string; icon: string }> = {
  finance: { label: "Tài chính", icon: "💰" },
  teachers: { label: "Giáo viên", icon: "🧑‍🏫" },
  students: { label: "Học viên", icon: "🧒" },
  classes: { label: "Lớp & điểm danh", icon: "📚" },
  system: { label: "Hệ thống", icon: "⚙️" },
};

const fieldNames: Record<string, string> = {
  full_name: "Họ và tên", student_code: "Mã học viên", parent_phone: "SĐT phụ huynh",
  phone: "Số điện thoại", email: "Email", branch_id: "Cơ sở", class_id: "Lớp",
  student_id: "Học viên", teacher_id: "Giáo viên", teacher: "Giáo viên",
  actual_teacher_id: "Giáo viên thực tế", standing_teacher_id: "Giáo viên chính",
  substitute_teacher_id: "Giáo viên dạy thay", status: "Trạng thái",
  join_date: "Ngày vào học", start_date: "Ngày bắt đầu", end_date: "Ngày kết thúc",
  attendance_date: "Ngày học", recorded_at: "Thời gian ghi nhận", recorded_by: "Người thực hiện",
  monthly_fee: "Học phí tháng", amount: "Số tiền", amount_due: "Phải thu",
  amount_paid: "Đã thu", category: "Danh mục", description: "Nội dung", note: "Ghi chú",
  salary_rate: "Mức lương", total_amount: "Tổng tiền", total_sessions: "Số buổi",
  payment_method: "Phương thức thanh toán", payroll_month: "Tháng lương", role: "Quyền",
};

function fieldLabel(key: string) {
  return fieldNames[key] || key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 1000) {
    return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
  }
  return String(value);
}

function formatVietnamDateTime(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("hour")}:${part("minute")}:${part("second")} · ${part("day")}/${part("month")}/${part("year")}`;
}

function formatDateOnly(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatValue(value);
}

function looksLikeUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function actionInfo(action: ActivityLog["action"]) {
  if (action === "INSERT") return { icon: "➕", label: "Thêm mới", className: "bg-emerald-50 text-emerald-700" };
  if (action === "DELETE") return { icon: "🗑️", label: "Xóa", className: "bg-rose-50 text-rose-700" };
  return { icon: "✏️", label: "Cập nhật", className: "bg-blue-50 text-blue-700" };
}

function changedFields(log: ActivityLog) {
  if (log.action !== "UPDATE") return [];
  const oldData = log.old_data || {};
  const newData = log.new_data || {};
  return Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]))
    .filter((key) => !["id", "created_at", "updated_at"].includes(key) && JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]))
    .map((key) => ({ key, oldValue: oldData[key], newValue: newData[key] }));
}

function mergeEntities<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return Array.from(merged.values());
}

function roleLabel(role: string | null) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Quản lý";
  if (role === "teacher") return "Giáo viên";
  return role || "Người dùng";
}

export default function ActivityLogPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const requestRef = useRef(0);

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [branchOptions, setBranchOptions] = useState<Branch[]>([]);
  const [students, setStudents] = useState<SimpleEntity[]>([]);
  const [teachers, setTeachers] = useState<SimpleEntity[]>([]);
  const [classes, setClasses] = useState<SimpleEntity[]>([]);
  const [tuition, setTuition] = useState<TuitionSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [stats, setStats] = useState<ActivityStats>({ total: 0, inserts: 0, updates: 0, deletes: 0 });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [monthFilter, setMonthFilter] = useState(vietnamCurrentMonth());
  const [branchFilter, setBranchFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [financialMode, setFinancialMode] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function authorizeAndLoadFilters() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.push("/login"); return; }
      const { data: currentProfile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
      if (currentProfile?.role !== "admin") { router.push("/dashboard"); return; }
      const [profilesRes, branchesRes] = await Promise.all([
        supabase.from("profiles").select("id,full_name,role").order("full_name"),
        supabase.from("branches").select("id,name").order("name"),
      ]);
      if (cancelled) return;
      setProfiles((profilesRes.data as Profile[]) ?? []);
      setBranchOptions((branchesRes.data as Branch[]) ?? []);
      setReady(true);
    }
    void authorizeAndLoadFilters();
    return () => { cancelled = true; };
  }, [router, supabase]);

  const loadRelatedEntities = useCallback(async (pageLogs: ActivityLog[]) => {
    const studentIds = new Set<string>();
    const teacherIds = new Set<string>();
    const classIds = new Set<string>();
    const tuitionIds = new Set<string>();
    const addId = (set: Set<string>, value: unknown) => { if (typeof value === "string" && value) set.add(value); };

    for (const log of pageLogs) {
      if (log.entity_type === "students") addId(studentIds, log.entity_id);
      if (log.entity_type === "teachers") addId(teacherIds, log.entity_id);
      if (log.entity_type === "classes") addId(classIds, log.entity_id);
      if (log.entity_type === "tuition") addId(tuitionIds, log.entity_id);
      for (const data of [log.old_data, log.new_data]) {
        if (!data) continue;
        addId(studentIds, data.student_id);
        addId(teacherIds, data.teacher);
        addId(teacherIds, data.teacher_id);
        addId(teacherIds, data.actual_teacher_id);
        addId(teacherIds, data.standing_teacher_id);
        addId(classIds, data.class_id);
        addId(tuitionIds, data.tuition_id);
      }
    }

    const tuitionRes = tuitionIds.size
      ? await supabase.from("tuition").select("id,student_id,amount_due,amount_paid,billing_month").in("id", Array.from(tuitionIds))
      : { data: [], error: null };
    for (const item of tuitionRes.data ?? []) addId(studentIds, item.student_id);

    const [studentsRes, teachersRes, classesRes] = await Promise.all([
      studentIds.size ? supabase.from("students").select("id,student_code,full_name").in("id", Array.from(studentIds)) : Promise.resolve({ data: [], error: null }),
      teacherIds.size ? supabase.from("teachers").select("id,full_name").in("id", Array.from(teacherIds)) : Promise.resolve({ data: [], error: null }),
      classIds.size ? supabase.from("classes").select("id,name").in("id", Array.from(classIds)) : Promise.resolve({ data: [], error: null }),
    ]);

    setStudents((current) => mergeEntities(current, (studentsRes.data as SimpleEntity[]) ?? []));
    setTeachers((current) => mergeEntities(current, (teachersRes.data as SimpleEntity[]) ?? []));
    setClasses((current) => mergeEntities(current, (classesRes.data as SimpleEntity[]) ?? []));
    setTuition((current) => mergeEntities(current, (tuitionRes.data as TuitionSummary[]) ?? []));
  }, [supabase]);

  const loadPage = useCallback(async (targetPage: number, append: boolean) => {
    const requestId = ++requestRef.current;
    if (append) setLoadingMore(true); else setLoading(true);
    setLoadError("");

    const { data, error } = await supabase.rpc("get_activity_log_page", {
      p_month: monthFilter ? `${monthFilter}-01` : null,
      p_branch_id: branchFilter === "all" ? null : branchFilter,
      p_user_id: userFilter === "all" ? null : userFilter,
      p_business_group: groupFilter === "all" ? null : groupFilter,
      p_action: actionFilter === "all" ? null : actionFilter,
      p_entity_type: entityFilter === "all" ? null : entityFilter,
      p_financial_only: financialMode,
      p_page: targetPage,
      p_page_size: PAGE_SIZE,
    });

    if (requestId !== requestRef.current) return;
    if (error) {
      setLoadError(`Không tải được lịch sử hoạt động: ${error.message}`);
      setLoading(false); setLoadingMore(false); return;
    }

    const result = data as ActivityPageResult;
    const nextRows = result?.rows ?? [];
    setLogs((current) => append ? [...current, ...nextRows] : nextRows);
    setStats(result?.stats ?? { total: 0, inserts: 0, updates: 0, deletes: 0 });
    setPage(targetPage);
    setHasMore(Boolean(result?.has_more));
    setLoading(false); setLoadingMore(false);
    void loadRelatedEntities(nextRows);
  }, [actionFilter, branchFilter, entityFilter, financialMode, groupFilter, loadRelatedEntities, monthFilter, supabase, userFilter]);

  useEffect(() => {
    if (!ready) return;
    setPage(1); setLogs([]);
    void loadPage(1, false);
  }, [ready, loadPage]);

  const profileMap = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  const studentMap = useMemo(() => new Map(students.map((item) => [item.id, item.student_code ? `${item.full_name} · ${item.student_code}` : item.full_name])), [students]);
  const teacherMap = useMemo(() => new Map(teachers.map((item) => [item.id, item.full_name])), [teachers]);
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes]);
  const tuitionMap = useMemo(() => new Map(tuition.map((item) => [item.id, item])), [tuition]);
  const branchMap = useMemo(() => new Map(branchOptions.map((item) => [item.id, item.name])), [branchOptions]);

  function activityValue(key: string, value: unknown) {
    const id = typeof value === "string" ? value : "";
    if (["teacher", "teacher_id", "actual_teacher_id", "standing_teacher_id", "substitute_teacher_id"].includes(key)) {
      return teacherMap.get(id) || "Không xác định";
    }
    if (key === "student_id") return studentMap.get(id) || "Không xác định";
    if (key === "class_id") return classMap.get(id) || "Không xác định";
    if (key === "branch_id") return branchMap.get(id) || "Không xác định";
    if (["recorded_by", "user_id", "created_by", "updated_by"].includes(key)) {
      return profileMap.get(id)?.full_name || "Không xác định";
    }
    if (key === "recorded_at" || key.endsWith("_at")) return formatVietnamDateTime(value);
    if (key.endsWith("_date")) return formatDateOnly(value);
    return formatValue(value);
  }

  function isUserFacingField(key: string, value: unknown) {
    if (["id", "created_at", "updated_at", "recorded_at", "recorded_by", "user_id", "class_session_id"].includes(key)) return false;
    if (key.endsWith("_id") && !["teacher_id", "actual_teacher_id", "standing_teacher_id", "substitute_teacher_id", "student_id", "class_id", "branch_id"].includes(key)) return false;
    if (typeof value === "object" && value !== null) return false;
    return !looksLikeUuid(value) || ["teacher", "teacher_id", "actual_teacher_id", "standing_teacher_id", "substitute_teacher_id", "student_id", "class_id", "branch_id"].includes(key);
  }

  function actorName(log: ActivityLog) {
    const data = log.new_data || log.old_data || {};
    const actorId = String(data.recorded_by ?? log.user_id ?? "");
    if (log.actor_name) return log.actor_name;
    if (actorId) return profileMap.get(actorId)?.full_name || "Không xác định";
    return "Hệ thống";
  }

  function getEntityLabel(log: ActivityLog) {
    const data = log.new_data || log.old_data || {};
    if (log.entity_type === "students") return studentMap.get(log.entity_id || "") || "Học viên";
    if (log.entity_type === "teachers") return teacherMap.get(log.entity_id || "") || "Giáo viên";
    if (log.entity_type === "classes") return classMap.get(log.entity_id || "") || "Lớp học";
    if (log.entity_type === "attendance") {
      const studentName = studentMap.get(String(data.student_id ?? ""));
      const className = classMap.get(String(data.class_id ?? ""));
      return studentName && className ? `${studentName} — ${className}` : "Bản ghi điểm danh";
    }
    if (log.entity_type === "teacher_attendance" || log.entity_type === "teacher_work_sessions") {
      const teacherName = teacherMap.get(String(data.teacher_id ?? data.actual_teacher_id ?? ""));
      const className = classMap.get(String(data.class_id ?? ""));
      return teacherName && className ? `${teacherName} — ${className}` : entityNames[log.entity_type];
    }
    if (log.entity_type === "teacher_payrolls") return teacherMap.get(String(data.teacher_id ?? "")) || "Bảng lương giáo viên";
    if (log.entity_type === "tuition") {
      const item = tuitionMap.get(log.entity_id || "");
      const studentName = studentMap.get(item?.student_id || "");
      return studentName ? `${studentName} — Học phí ${item?.billing_month?.slice(0, 7) || ""}` : "Khoản học phí";
    }
    if (log.entity_type === "tuition_payments") {
      const item = tuitionMap.get(String(data.tuition_id ?? ""));
      return studentMap.get(item?.student_id || "") || "Thu học phí";
    }
    if (log.entity_type === "expenses" || log.entity_type === "other_revenues") return String(data.description ?? data.category ?? entityNames[log.entity_type]);
    if (log.entity_type === "profiles") return profileMap.get(log.entity_id || "")?.full_name || String(data.full_name ?? "Tài khoản");
    return entityNames[log.entity_type] || log.entity_type;
  }

  function toggleFinancialMode() {
    setFinancialMode((current) => !current);
    setGroupFilter("all");
    setEntityFilter("all");
  }

  if (!ready && loading) return <div className="ui-card p-12 text-center text-slate-400">Đang kiểm tra quyền truy cập...</div>;

  return (
    <div className="space-y-7">
      <section>
        <div className="text-sm font-bold uppercase tracking-wider text-blue-600">🕵️ QUẢN TRỊ HỆ THỐNG</div>
        <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Lịch sử hoạt động</h1>
            <p className="mt-2 text-sm text-slate-500 sm:text-base">Nhật ký dài hạn, lọc và thống kê trên toàn bộ dữ liệu hệ thống.</p>
          </div>
          <button type="button" onClick={toggleFinancialMode} className={`rounded-2xl px-5 py-3 text-sm font-black transition ${financialMode ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
            {financialMode ? "✓ Đang kiểm tra tài chính" : "💰 Kiểm tra tài chính"}
          </button>
        </div>
      </section>

      {financialMode && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <div className="font-black">Chế độ kiểm tra tài chính đang bật</div>
        <p className="mt-1 text-sm">Chỉ hiển thị học phí, thu tiền, điều chỉnh, chi phí, thu khác, buổi công và bảng lương. Mọi thống kê bên dưới đều theo đúng bộ lọc hiện tại.</p>
      </section>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Tổng hoạt động", stats.total, "text-slate-900"], ["✏️ Cập nhật", stats.updates, "text-blue-700"], ["➕ Thêm mới", stats.inserts, "text-emerald-700"], ["🗑️ Đã xóa", stats.deletes, "text-rose-700"]].map(([label, value, color]) => (
          <div key={String(label)} className="ui-card p-5"><div className="text-sm font-semibold text-slate-400">{label}</div><div className={`mt-2 text-3xl font-black ${color}`}>{value}</div></div>
        ))}
      </section>

      <section className="ui-card p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">Tháng<div className="mt-1 flex gap-2"><input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="ui-input min-w-0 flex-1"/><button type="button" onClick={() => setMonthFilter("")} className="ui-btn whitespace-nowrap">Tất cả</button></div></label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">Cơ sở<select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="ui-input mt-1 w-full"><option value="all">🏢 Tất cả cơ sở</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">Người thực hiện / quản lý<select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} className="ui-input mt-1 w-full"><option value="all">👤 Tất cả người dùng</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || "Chưa đặt tên"} · {roleLabel(profile.role)}</option>)}</select></label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">Nhóm nghiệp vụ<select value={financialMode ? "finance" : groupFilter} disabled={financialMode} onChange={(event) => setGroupFilter(event.target.value)} className="ui-input mt-1 w-full disabled:cursor-not-allowed disabled:bg-emerald-50"><option value="all">📦 Tất cả nhóm</option>{Object.entries(groupInfo).map(([value, info]) => <option key={value} value={value}>{info.icon} {info.label}</option>)}</select></label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">Hành động<select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="ui-input mt-1 w-full"><option value="all">⚡ Tất cả hành động</option><option value="INSERT">➕ Thêm mới</option><option value="UPDATE">✏️ Cập nhật</option><option value="DELETE">🗑️ Xóa</option></select></label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">Đối tượng<select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} className="ui-input mt-1 w-full"><option value="all">🗂️ Tất cả đối tượng</option>{Object.entries(entityNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </section>

      <section className="ui-card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="text-xl font-black">📋 Nhật ký hệ thống</h2><p className="mt-1 text-sm text-slate-400">Đã tải {logs.length} / {stats.total} hoạt động phù hợp</p></div>
        {loadError ? <div className="p-10 text-center"><div className="font-bold text-rose-600">{loadError}</div><button type="button" onClick={() => void loadPage(1, false)} className="ui-btn mt-4">Thử lại</button></div>
        : loading ? <div className="p-12 text-center text-slate-400">Đang tải lịch sử hoạt động...</div>
        : logs.length === 0 ? <div className="p-12 text-center text-slate-400"><div className="text-5xl">🕵️</div><div className="mt-4 font-black">Không có hoạt động phù hợp</div></div>
        : <><div className="divide-y divide-slate-100">{logs.map((log) => {
          const info = actionInfo(log.action); const group = groupInfo[log.business_group] || groupInfo.system; const changes = changedFields(log);
          return <button key={log.id} type="button" onClick={() => setSelectedLog(log)} className="block w-full text-left transition hover:bg-slate-50"><div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
            <div className="shrink-0 text-xs font-semibold text-slate-400 lg:w-[155px]">{new Date(log.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</div>
            <div className={`flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${info.className}`}><span>{info.icon}</span>{info.label}</div>
            <div className="min-w-0 flex-1"><div className="font-black text-slate-900">{getEntityLabel(log)}</div><div className="mt-1 flex flex-wrap gap-x-2 text-sm text-slate-500"><span>{entityNames[log.entity_type] || log.entity_type}</span><span>· {group.icon} {group.label}</span>{log.branch_name && <span>· 🏢 {log.branch_name}</span>}{changes.length > 0 && <span>· {changes.length} thay đổi</span>}</div></div>
            <div className="shrink-0 text-sm font-bold text-slate-600">👤 {log.actor_name || profileMap.get(log.user_id || "")?.full_name || "Hệ thống"}{log.actor_role && <div className="mt-0.5 text-right text-xs font-medium text-slate-400">{roleLabel(log.actor_role)}</div>}</div><div className="text-slate-300">›</div>
          </div></button>;
        })}</div>{hasMore && <div className="border-t border-slate-100 p-5 text-center"><button type="button" disabled={loadingMore} onClick={() => void loadPage(page + 1, true)} className="ui-btn ui-btn-blue min-w-52 disabled:opacity-60">{loadingMore ? "Đang tải thêm..." : `Xem thêm ${Math.min(PAGE_SIZE, stats.total - logs.length)} hoạt động`}</button></div>}</>}
      </section>

      {selectedLog && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-6"><div><div className="text-xs font-bold uppercase tracking-wider text-blue-600">CHI TIẾT HOẠT ĐỘNG</div><h2 className="mt-1 text-2xl font-black">{getEntityLabel(selectedLog)}</h2><p className="mt-1 text-sm text-slate-400">{formatVietnamDateTime(selectedLog.created_at)}</p></div><button type="button" onClick={() => setSelectedLog(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg hover:bg-slate-200">✕</button></div>
        <div className="max-h-[65vh] overflow-y-auto p-6"><div className="mb-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-400">👤 Người thực hiện</div><div className="mt-1 text-lg font-black">{actorName(selectedLog)}</div><div className="mt-1 text-xs text-slate-400">{roleLabel(selectedLog.actor_role || profileMap.get(selectedLog.user_id || "")?.role || null)}</div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-400">🕘 Thời gian ghi nhận</div><div className="mt-1 text-lg font-black">{formatVietnamDateTime((selectedLog.new_data || selectedLog.old_data || {}).recorded_at || selectedLog.created_at)}</div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-400">Hành động</div><div className="mt-1 text-lg font-black">{actionInfo(selectedLog.action).icon} {actionInfo(selectedLog.action).label}</div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-400">🏢 Cơ sở</div><div className="mt-1 text-lg font-black">{selectedLog.branch_name || branchMap.get(selectedLog.branch_id || "") || "Toàn CLB / chưa xác định"}</div></div></div>
          {selectedLog.action === "UPDATE" ? (() => { const changes = changedFields(selectedLog).filter((change) => isUserFacingField(change.key, change.newValue ?? change.oldValue)); return changes.length > 0 ? <div className="overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-[1fr_1fr_1fr] border-b bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-400"><div>Thông tin</div><div>Trước</div><div>Sau</div></div>{changes.map((change) => <div key={change.key} className="grid grid-cols-[1fr_1fr_1fr] border-b border-slate-100 px-4 py-4 text-sm last:border-0"><div className="font-black">{fieldLabel(change.key)}</div><div className="break-words text-rose-600">{activityValue(change.key, change.oldValue)}</div><div className="break-words font-bold text-emerald-700">{activityValue(change.key, change.newValue)}</div></div>)}</div> : <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Hoạt động này chỉ thay đổi thông tin kỹ thuật.</div>; })()
          : <div className="grid gap-3 sm:grid-cols-2">{Object.entries(selectedLog.action === "DELETE" ? selectedLog.old_data || {} : selectedLog.new_data || {}).filter(([key, value]) => isUserFacingField(key, value)).map(([key, value]) => <div key={key} className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-400">{fieldLabel(key)}</div><div className="mt-1 break-words text-lg font-semibold">{activityValue(key, value)}</div></div>)}</div>}
          <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-600">Chi tiết kỹ thuật</summary><pre className="max-h-72 overflow-auto border-t border-slate-200 p-4 text-xs text-slate-600">{JSON.stringify(selectedLog, null, 2)}</pre></details>
        </div><div className="flex justify-end border-t border-slate-100 p-5"><button type="button" onClick={() => setSelectedLog(null)} className="ui-btn ui-btn-light">Đóng</button></div>
      </div></div>}
    </div>
  );
}
