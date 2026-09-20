"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamToday } from "@/lib/vietnam-date";

type AuditEvent = {
  action: "INSERT" | "UPDATE";
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
  status: string | null;
};

type AttendanceSession = {
  attendance_id: string;
  attendance_date: string;
  class_name: string | null;
  status: string;
  audit: AuditEvent[];
};

type AttendanceResult = {
  taught_count: number;
  sessions: AttendanceSession[];
};

function actorRole(role: string | null) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Quản lý";
  if (role === "teacher") return "Giáo viên";
  return "Không xác định";
}

function actionLabel(action: AuditEvent["action"]) {
  return action === "INSERT" ? "Tạo ban đầu" : "Chỉnh sửa";
}

export function AttendanceDetailSheet({
  teacher,
  onClose,
}: {
  teacher: { id: string; full_name: string };
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(vietnamToday().slice(0, 7));
  const [result, setResult] = useState<AttendanceResult>({ taught_count: 0, sessions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("get_teacher_attendance_audit", {
      p_teacher_id: teacher.id,
      p_month: `${month}-01`,
    });
    if (rpcError) {
      setError("Không tải được chi tiết chấm công. " + rpcError.message);
    } else {
      setResult((data ?? { taught_count: 0, sessions: [] }) as AttendanceResult);
    }
    setLoading(false);
  }, [month, supabase, teacher.id]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-labelledby="attendance-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="h-full w-full overflow-y-auto bg-slate-50 p-5 shadow-2xl sm:max-w-xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-blue-600">Giáo viên</div>
            <h2 id="attendance-detail-title" className="mt-1 text-2xl font-black">Chi tiết chấm công</h2>
            <p className="mt-1 font-bold text-slate-600">{teacher.full_name}</p>
          </div>
          <button type="button" className="ui-btn" onClick={onClose} aria-label="Đóng chi tiết chấm công">✕</button>
        </div>

        <label className="mt-6 block">
          <span className="mb-2 block text-sm font-bold">Tháng</span>
          <input type="month" className="ui-input" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>

        <div className="ui-card mt-5 p-5">
          <div className="text-sm font-bold text-slate-500">Tổng số buổi Đã dạy</div>
          <div className="mt-1 text-3xl font-black text-emerald-600">{loading ? "…" : result.taught_count}</div>
          <p className="mt-1 text-xs text-slate-400">Đếm từ chấm công có trạng thái Đã dạy.</p>
        </div>

        {error ? <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}
        {loading ? <div className="py-10 text-center text-slate-400">Đang tải lịch sử...</div> : null}
        {!loading && !error && result.sessions.length === 0 ? <div className="py-10 text-center text-slate-400">Không có buổi chấm công trong tháng này.</div> : null}

        <div className="mt-5 space-y-4">
          {!loading && !error && result.sessions.map((session) => (
            <article key={session.attendance_id} className="ui-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black">{new Date(`${session.attendance_date}T00:00:00`).toLocaleDateString("vi-VN")}</div>
                  <div className="mt-1 text-sm text-slate-500">{session.class_name || "Lớp không còn tồn tại"}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${session.status === "taught" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {session.status === "taught" ? "Đã dạy" : "Nghỉ"}
                </span>
              </div>

              {session.audit.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-slate-100 p-3 text-sm font-semibold text-slate-500">Không có lịch sử thao tác</div>
              ) : (
                <ol className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">
                  {session.audit.map((event, index) => (
                    <li key={`${event.created_at}-${index}`} className="text-sm">
                      <div className="font-black text-slate-800">{actionLabel(event.action)}</div>
                      <div className="text-slate-500">{new Date(event.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</div>
                      <div className="text-slate-600">{event.actor_name || "Không có tên người thực hiện"} · {actorRole(event.actor_role)}</div>
                      {event.status ? <div className="text-slate-500">Trạng thái: {event.status === "taught" ? "Đã dạy" : "Nghỉ"}</div> : null}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
