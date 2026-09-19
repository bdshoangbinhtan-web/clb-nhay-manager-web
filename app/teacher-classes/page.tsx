"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { scheduleIncludesDay } from "@/lib/class-schedule";
import { vietnamScheduleDayKey, vietnamToday, vietnamTodayLabel } from "@/lib/vietnam-date";

type ClassItem = {
  id: string;
  name: string;
  status: string;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
};

type Assignment = { teacher_id: string; classes: ClassItem | null };
type Membership = { class_id: string };
type Attendance = { class_id: string };

function TeacherClassesContent() {
  const supabase = useMemo(() => createClient(), []);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const showAll = searchParams.get("view") === "all";
  const today = vietnamToday();

  useEffect(() => {
    async function loadClasses() {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Không xác định được tài khoản giáo viên."); setLoading(false); return; }

      const { data: teacher } = await supabase.from("teachers").select("id").eq("profile_id", user.id).eq("status", "active").maybeSingle();
      if (!teacher) { setError("Không tìm thấy tài khoản giáo viên."); setLoading(false); return; }

      const { data, error: classesError } = await supabase.from("class_teachers").select(`teacher_id, classes (id,name,status,schedule_days,schedule_start,schedule_end)`).eq("teacher_id", teacher.id);
      if (classesError) { console.error(classesError); setError("Không tải được danh sách lớp."); setLoading(false); return; }

      const assigned = ((data ?? []) as unknown as Assignment[]).map((row) => row.classes).filter((item): item is ClassItem => Boolean(item && item.status === "active"));
      const classIds = assigned.map((item) => item.id);
      const [memberships, attendance] = classIds.length ? await Promise.all([
        supabase.from("class_students").select("class_id").in("class_id", classIds).eq("status", "active"),
        supabase.from("attendance").select("class_id").in("class_id", classIds).eq("attendance_date", today),
      ]) : [{ data: [] }, { data: [] }];

      const counts: Record<string, number> = {};
      ((memberships.data ?? []) as Membership[]).forEach((row) => { counts[row.class_id] = (counts[row.class_id] ?? 0) + 1; });
      setClasses(assigned.sort((a, b) => (a.schedule_start ?? "99:99").localeCompare(b.schedule_start ?? "99:99")));
      setStudentCounts(counts);
      setAttendedIds(new Set(((attendance.data ?? []) as Attendance[]).map((row) => row.class_id)));
      setLoading(false);
    }
    void loadClasses();
  }, [supabase, today]);

  const todayClasses = classes.filter((item) => scheduleIncludesDay(item.schedule_days, vietnamScheduleDayKey()));
  const displayedClasses = showAll ? classes : todayClasses;
  const nowParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  const nowMinutes = nowParts[0] * 60 + nowParts[1];
  const nextClassId = todayClasses.find((item) => {
    if (!item.schedule_start) return false;
    const [hours, minutes] = item.schedule_start.split(":").map(Number);
    return hours * 60 + minutes >= nowMinutes;
  })?.id;

  function scheduleLabel(item: ClassItem) {
    const labels: Record<string, string> = { "0": "CN", "2": "T2", "3": "T3", "4": "T4", "5": "T5", "6": "T6", "7": "T7" };
    const days = (item.schedule_days ?? []).map((day) => labels[String(day).toUpperCase()] ?? String(day).toUpperCase()).join(", ");
    return days ? `Lịch ${days}` : "Chưa có lịch cố định";
  }

  function status(item: ClassItem) {
    if (attendedIds.has(item.id)) return "Đã điểm danh";
    if (!item.schedule_start) return "Chưa điểm danh";
    const [hours, minutes] = item.schedule_start.split(":").map(Number);
    return nowMinutes < hours * 60 + minutes ? "Sắp bắt đầu" : "Chưa điểm danh";
  }

  return (
    <div className="abk-mobile-page space-y-5 lg:space-y-6">
      <header className="w-full max-w-full min-w-0">
        <div className="min-w-0"><p className="abk-eyebrow">Lịch giảng dạy</p><h1 className="mt-1 text-2xl font-black">{showAll ? "Tất cả lớp" : "Lớp của tôi hôm nay"}</h1><p className="mt-1 text-sm capitalize text-slate-500">{showAll ? "Tất cả lớp đang được phân công" : vietnamTodayLabel()}</p></div>
      </header>

      {loading ? <div className="abk-mobile-card p-6 text-slate-500">Đang tải lịch dạy...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div> : null}
      {!loading && !error && displayedClasses.length === 0 ? <div className="abk-mobile-card abk-empty-state"><div className="text-2xl">☀️</div><h3>{showAll ? "Bạn chưa được phân công lớp." : "Hôm nay bạn không có lớp."}</h3><p>{showAll ? "Danh sách sẽ cập nhật khi có phân công mới." : "Bạn có thể xem lịch đầy đủ trong Tất cả lớp."}</p></div> : null}
      {!loading && !error && displayedClasses.length > 0 ? <div className="grid w-full max-w-full min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">{displayedClasses.map((item) => <Link key={item.id} href={`/teacher-student-attendance?classId=${item.id}&date=${today}`} className={`abk-mobile-card grid min-h-[116px] w-full max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-4 transition hover:border-blue-200 ${!showAll && item.id === nextClassId ? "ring-2 ring-blue-100" : ""}`}><div className="w-14 shrink-0 text-center"><strong className="block text-lg font-black text-slate-950">{item.schedule_start?.slice(0, 5) ?? "--:--"}</strong>{item.schedule_end ? <span className="text-[11px] font-bold text-slate-400">– {item.schedule_end.slice(0, 5)}</span> : null}</div><div className="w-full max-w-full min-w-0"><h2 className="line-clamp-2 break-words text-base font-black text-slate-950 [overflow-wrap:anywhere]">{item.name}</h2><p className="mt-1 text-sm text-slate-500">{studentCounts[item.id] ?? 0} học viên</p><p className={`mt-2 text-xs font-extrabold ${attendedIds.has(item.id) ? "text-emerald-700" : "text-blue-700"}`}>{showAll ? scheduleLabel(item) : status(item)}</p></div><span className="shrink-0 text-2xl text-slate-300" aria-hidden="true">›</span></Link>)}</div> : null}
    </div>
  );
}


export default function TeacherClassesPage() {
  return (
    <Suspense
      fallback={
        <div className="abk-mobile-page">
          <div className="abk-mobile-card p-6 text-slate-500">
            Đang tải lịch dạy...
          </div>
        </div>
      }
    >
      <TeacherClassesContent />
    </Suspense>
  );
}
