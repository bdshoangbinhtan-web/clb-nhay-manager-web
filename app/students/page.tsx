"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, InlineState, Skeleton } from "@/components/ui/mobile-ui";
import { StudentAvatar } from "@/components/students/student-avatar";
import { createClient } from "@/lib/supabase/client";
import { getStudentAvatarUrls } from "@/lib/student-avatar-storage";

type Student = { id: string; student_code: string; full_name: string; status: string | null; created_at: string; join_date: string | null; branch_id: string | null };
type Branch = { id: string; name: string };
type ClassStudent = { student_id: string; class_id: string; classes: { id: string; name: string; branch_id: string } | { id: string; name: string; branch_id: string }[] | null };
type SpeechRecognitionInstance = { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void; onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };
type SpeechRecognitionWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance };

const STUDENTS_PER_BATCH = 60;
const SCROLL_KEY = "abk-students-scroll";

export default function StudentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classStudents, setClassStudents] = useState<ClassStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [branchFilter, setBranchFilter] = useState(() => searchParams.get("branch") ?? "all");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "active");
  const [visibleCount, setVisibleCount] = useState(STUDENTS_PER_BATCH);
  const [voiceSearching, setVoiceSearching] = useState(false);
  const [avatarUrls, setAvatarUrls] = useState<Map<string, string>>(new Map());
  const restoredScroll = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  function startVoiceSearch() {
    if (voiceSearching) { recognitionRef.current?.stop(); return; }
    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) { alert("Trình duyệt này chưa hỗ trợ tìm kiếm bằng giọng nói. Bạn có thể dùng micro của bàn phím điện thoại."); return; }
    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    setVoiceSearching(true);
    recognition.onresult = (event) => { const transcript = event.results?.[0]?.[0]?.transcript?.trim(); if (transcript) setSearch(transcript); };
    recognition.onerror = () => setVoiceSearching(false);
    recognition.onend = () => { setVoiceSearching(false); recognitionRef.current = null; };
    recognition.start();
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [studentsRes, branchesRes, classStudentsRes] = await Promise.all([
      supabase.from("students").select("id,student_code,full_name,status,created_at,join_date,branch_id").order("full_name"),
      supabase.from("branches").select("id,name").order("name"),
      supabase.from("class_students").select("student_id,class_id,classes(id,name,branch_id)").eq("status", "active"),
    ]);
    const requestError = studentsRes.error || branchesRes.error || classStudentsRes.error;
    if (requestError) {
      console.error(requestError);
      setError("Không thể tải danh sách học viên. Vui lòng thử lại.");
    }
    setStudents(studentsRes.data ?? []);
    setBranches(branchesRes.data ?? []);
    setClassStudents(classStudentsRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search);
    if (branchFilter !== "all") params.set("branch", branchFilter);
    if (statusFilter !== "active") params.set("status", statusFilter);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [branchFilter, pathname, router, search, statusFilter]);

  useEffect(() => {
    if (loading || restoredScroll.current) return;
    restoredScroll.current = true;
    const saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0);
    if (saved > 0) requestAnimationFrame(() => window.scrollTo({ top: saved }));
  }, [loading]);

  useEffect(() => {
    const rememberScroll = () => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    window.addEventListener("pagehide", rememberScroll);
    return () => { rememberScroll(); window.removeEventListener("pagehide", rememberScroll); };
  }, []);

  const branchMap = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches]);
  const classMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of classStudents) {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      if (cls) map.set(row.student_id, [...(map.get(row.student_id) ?? []), cls.name]);
    }
    return map;
  }, [classStudents]);
  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return students.filter((student) =>
      (!keyword || student.full_name.toLowerCase().includes(keyword) || student.student_code.toLowerCase().includes(keyword)) &&
      (branchFilter === "all" || student.branch_id === branchFilter) &&
      (statusFilter === "all" || student.status === statusFilter));
  }, [branchFilter, search, statusFilter, students]);
  useEffect(() => { setVisibleCount(STUDENTS_PER_BATCH); }, [branchFilter, search, statusFilter]);
  const visibleStudents = filteredStudents.slice(0, visibleCount);
  const visibleStudentIds = useMemo(() => filteredStudents.slice(0, visibleCount).map((item) => item.id), [filteredStudents, visibleCount]);
  useEffect(() => {
    if (loading || !visibleStudentIds.length) return;
    let active = true;
    void getStudentAvatarUrls(supabase, visibleStudentIds).then((urls) => {
      if (active) setAvatarUrls((current) => new Map([...current, ...urls]));
    });
    return () => { active = false; };
  }, [loading, supabase, visibleStudentIds]);
  const activeCount = students.filter((item) => item.status === "active").length;
  const hasFilters = Boolean(search.trim()) || branchFilter !== "all" || statusFilter !== "active";
  const contextParams = new URLSearchParams();
  if (search.trim()) contextParams.set("q", search);
  if (branchFilter !== "all") contextParams.set("branch", branchFilter);
  if (statusFilter !== "active") contextParams.set("status", statusFilter);
  const returnPath = `${pathname}${contextParams.toString() ? `?${contextParams.toString()}` : ""}`;
  const detailHref = (id: string, edit = false) => `/students/${id}?${new URLSearchParams({ ...(edit ? { edit: "1" } : {}), from: returnPath })}`;
  const clearFilters = () => { setSearch(""); setBranchFilter("all"); setStatusFilter("active"); };

  return (
    <div className="min-w-0 space-y-5 sm:space-y-7">
      <section className="flex min-w-0 items-start justify-between gap-3 sm:items-end">
        <div className="min-w-0"><div className="mb-1 text-xs font-black text-blue-600 sm:mb-2 sm:text-sm">QUẢN LÝ HỌC VIÊN</div><h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Học viên</h1><p className="mt-2 hidden text-sm text-slate-500 sm:block sm:text-base">Quản lý hồ sơ, lớp học và tình trạng học viên</p></div>
        <Link href="/students/new" className="ui-btn ui-btn-primary flex min-h-12 shrink-0 items-center gap-1 px-4 sm:gap-2 sm:px-5"><span className="text-xl">＋</span><span className="hidden sm:inline">Thêm học viên</span><span className="sm:hidden">Thêm</span></Link>
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        {[["Tổng", students.length, "text-slate-900"], ["Đang học", activeCount, "text-emerald-700"], ["Tạm ngưng", students.length - activeCount, "text-slate-600"]].map(([label, value, tone]) => <div key={String(label)} className="ui-card min-w-0 p-3 sm:p-5"><div className="truncate text-[11px] font-bold text-slate-400 sm:text-sm">{label}</div><div className={`mt-1 text-xl font-black sm:text-2xl ${tone}`}>{loading ? "—" : value}</div></div>)}
      </section>

      <section className="ui-card min-w-0 p-3 sm:p-5">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[1fr_220px_180px]">
          <label className="relative block min-w-0"><span className="sr-only">Tìm học viên</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc mã học viên…" className={`ui-input min-w-0 ${search ? "pr-20" : "pr-12"}`} /><button type="button" onClick={startVoiceSearch} aria-label={voiceSearching ? "Dừng tìm kiếm giọng nói" : "Tìm bằng giọng nói"} className={`absolute top-0 flex h-12 w-10 items-center justify-center ${search ? "right-10" : "right-1"} ${voiceSearching ? "animate-pulse text-red-600" : "text-slate-500"}`}>{voiceSearching ? "🔴" : "🎙️"}</button>{search ? <button type="button" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm" className="absolute right-0 top-0 flex h-12 w-10 items-center justify-center text-2xl text-slate-400">×</button> : null}</label>
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:contents"><select aria-label="Lọc theo cơ sở" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="ui-input min-w-0"><option value="all">Tất cả cơ sở</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Lọc theo trạng thái" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ui-input min-w-0"><option value="active">Đang học</option><option value="inactive">Tạm ngưng</option><option value="all">Tất cả</option></select></div>
        </div>
        <div className="mt-3 flex min-w-0 items-center justify-between gap-3 text-xs font-bold text-slate-500">
          <span className="min-w-0">Hiển thị {visibleStudents.length}/{filteredStudents.length} học viên</span>
          {hasFilters ? <button type="button" onClick={clearFilters} className="min-h-11 shrink-0 px-2 text-blue-700">Xóa bộ lọc</button> : null}
        </div>
      </section>

      <section className="min-w-0"><div className="mb-3"><h2 className="text-lg font-black sm:text-xl">Danh sách học viên</h2></div>
        {loading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32 sm:h-56 lg:h-44" />)}</div> : error ? <div className="ui-card p-4"><InlineState type="error" title="Không tải được học viên"><button type="button" onClick={() => void loadData()} className="mt-2 min-h-11 font-black underline">Thử lại</button></InlineState></div> : filteredStudents.length === 0 ? <div className="ui-card"><EmptyState icon="⌕" title={students.length === 0 && !hasFilters ? "Chưa có học viên" : "Không tìm thấy học viên"} description={hasFilters ? "Thử từ khóa khác hoặc xóa bộ lọc hiện tại." : "Học viên mới sẽ xuất hiện tại đây."} action={hasFilters ? <button type="button" onClick={clearFilters} className="abk-secondary-button mt-4">Xóa bộ lọc</button> : undefined} /></div> : <div className="grid min-w-0 gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleStudents.map((student) => { const classes = classMap.get(student.id) ?? []; const active = student.status === "active"; const joinDate = student.join_date || student.created_at; return <article key={student.id} className="ui-card min-w-0 overflow-hidden transition hover:shadow-lg"><Link href={detailHref(student.id)} onClick={() => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))} className="block min-w-0 p-4 sm:p-5 lg:p-4 lg:pb-3"><div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)_auto] items-start gap-3 sm:grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[48px_minmax(0,1fr)]"><StudentAvatar name={student.full_name} url={avatarUrls.get(student.id)} /><div className="min-w-0"><h3 className="break-words text-base font-black text-slate-950 [overflow-wrap:anywhere] sm:text-[17px]">{student.full_name}</h3><p className="mt-1 break-all text-xs font-black tracking-wide text-blue-600">{student.student_code}</p><p className="mt-1 line-clamp-2 break-words text-sm text-slate-500 [overflow-wrap:anywhere]">{student.branch_id ? branchMap.get(student.branch_id) || "Chưa xác định" : "Chưa gán cơ sở"}</p></div><span className="text-2xl text-slate-300 sm:hidden">›</span></div><div className="mt-3 min-w-0 rounded-2xl bg-slate-50 p-3 lg:mt-2 lg:px-3 lg:py-2"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Lớp đang học</p><p className="mt-1 line-clamp-2 break-words text-sm font-bold text-slate-700 [overflow-wrap:anywhere] lg:line-clamp-1">{classes.length ? classes.join(" · ") : "Chưa tham gia lớp"}</p></div><div className="mt-3 flex min-w-0 items-center justify-between gap-2 lg:mt-2"><span className={`ui-pill shrink-0 ${active ? "ui-pill-active" : ""}`}>{active ? "🟢 Đang học" : "⚪ Tạm ngưng"}</span><span className="hidden text-xs text-slate-400 sm:block">Vào học {new Date(joinDate.includes("T") ? joinDate : `${joinDate}T00:00:00`).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span></div></Link><div className="hidden justify-end border-t border-slate-100 px-3 py-2 sm:flex"><Link href={detailHref(student.id, true)} className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-bold text-blue-700 hover:bg-blue-50">✏️ Sửa</Link></div></article>; })}
          {visibleStudents.length < filteredStudents.length ? <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + STUDENTS_PER_BATCH, filteredStudents.length))} className="ui-card min-h-14 p-4 font-black text-blue-600 sm:min-h-40">Hiển thị thêm</button> : null}
        </div>}
      </section>
    </div>
  );
}
