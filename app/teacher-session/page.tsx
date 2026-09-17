"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamScheduleDayKey, vietnamToday } from "@/lib/vietnam-date";
import { scheduleIncludesDay } from "@/lib/class-schedule";

type ClassItem = {
  id: string;
  name: string;
  status: string;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
};

type SessionItem = {
  id: string;
  classId: string;
  name: string;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
  teachingType: "regular" | "substitute";
  standingTeacherId: string;
  standingTeacherName: string;
  requestId: string | null;
};

type ClassAssignment = {
  class_id: string;
  teacher_id: string;
  classes: ClassItem | null;
};

type SubstitutionRow = {
  request_id: string;
  class_id: string;
  class_name: string;
  standing_teacher_id: string;
  standing_teacher_name: string;
  substitute_teacher_id: string;
  session_date: string;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
};

const DAY_LABELS: Record<string, string> = {
  "2": "T2",
  "3": "T3",
  "4": "T4",
  "5": "T5",
  "6": "T6",
  "7": "T7",
  "0": "CN",
};

function getTodayKey() {
  return vietnamScheduleDayKey();
}

function getTodayLabel() {
  return DAY_LABELS[getTodayKey()] ?? "";
}

function getTodayDate() {
  return vietnamToday();
}

function getScheduleDayKeyForDate(date: string) {
  // date có dạng YYYY-MM-DD. Dùng UTC để lấy đúng thứ trong tuần
  // mà không phụ thuộc timezone của trình duyệt.
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();

  return day === 0 ? "0" : String(day + 1);
}

function getRequestedSessionContext() {
  const fallbackDate = getTodayDate();

  if (typeof window === "undefined") {
    return {
      date: fallbackDate,
      classId: "",
      dayKey: getScheduleDayKeyForDate(fallbackDate),
    };
  }

  const params = new URLSearchParams(window.location.search);
  const requestedDate = params.get("date");
  const requestedClassId = params.get("classId") ?? "";

  // Chỉ nhận date dạng YYYY-MM-DD; nếu URL không hợp lệ thì dùng ngày VN hiện tại.
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : fallbackDate;

  return {
    date,
    classId: requestedClassId,
    dayKey: getScheduleDayKeyForDate(date),
  };
}

export default function TeacherSessionPage() {
  const supabase = useMemo(() => createClient(), []);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [sessionDate, setSessionDate] = useState(getTodayDate());
  const [sessionDayKey, setSessionDayKey] = useState(getTodayKey());

  const sessionDayLabel = DAY_LABELS[sessionDayKey] ?? "";
  const isToday = sessionDate === getTodayDate();

  const loadData = useCallback(async () => {
    const {
      date,
      classId: requestedClassId,
      dayKey: todayKey,
    } = getRequestedSessionContext();

    setSessionDate(date);
    setSessionDayKey(todayKey);
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("Không xác định được tài khoản giáo viên.");
      setLoading(false);
      return;
    }

    const { data: teacherData, error: teacherError } = await supabase
      .from("teachers")
      .select("id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .single();

    if (teacherError || !teacherData) {
      setError("Không tìm thấy tài khoản giáo viên.");
      setLoading(false);
      return;
    }

    const currentTeacherId = teacherData.id;
    setTeacherId(currentTeacherId);

    // 1. Lớp được phân công chính thức hôm nay.
    const { data: assignmentData, error: assignmentError } = await supabase
      .from("class_teachers")
      .select(`
        class_id,
        teacher_id,
        classes (
          id,
          name,
          status,
          schedule_days,
          schedule_start,
          schedule_end
        )
      `);

    if (assignmentError) {
      console.error(assignmentError);
      setError("Không tải được các lớp của bạn.");
      setLoading(false);
      return;
    }

    const assignments = (assignmentData ?? []) as unknown as ClassAssignment[];

    const regularSessions: SessionItem[] = assignments
      .filter(
        (item) =>
          item.teacher_id === currentTeacherId &&
          item.classes &&
          item.classes.status === "active" &&
          scheduleIncludesDay(item.classes.schedule_days, todayKey)
      )
      .map((item) => ({
        id: `regular-${item.class_id}`,
        classId: item.class_id,
        name: item.classes!.name,
        schedule_days: item.classes!.schedule_days,
        schedule_start: item.classes!.schedule_start,
        schedule_end: item.classes!.schedule_end,
        teachingType: "regular",
        standingTeacherId: currentTeacherId,
        standingTeacherName: "",
        requestId: null,
      }));

    // 2. Các buổi dạy thay đã được Admin duyệt.
    const {
      data: substitutionData,
      error: substitutionError,
    } = await supabase.rpc("get_teacher_approved_substitution_sessions");

    if (substitutionError) {
      console.error(substitutionError);
      setError(
        "Không tải được các buổi dạy thay đã được duyệt: " +
          substitutionError.message
      );
      setLoading(false);
      return;
    }

    const substitutionRows =
      (substitutionData ?? []) as SubstitutionRow[];

    const substituteSessions: SessionItem[] = substitutionRows
      .filter(
        (row) =>
          row.substitute_teacher_id === currentTeacherId &&
          row.session_date === date
      )
      .map((row) => ({
        id: `substitute-${row.request_id}`,
        classId: row.class_id,
        name: row.class_name,
        schedule_days: row.schedule_days,
        schedule_start: row.schedule_start,
        schedule_end: row.schedule_end,
        teachingType: "substitute",
        standingTeacherId: row.standing_teacher_id,
        standingTeacherName: row.standing_teacher_name,
        requestId: row.request_id,
      }));

    // Không để một lớp bị hiện 2 lần.
    const merged = new Map<string, SessionItem>();

    for (const item of regularSessions) {
      merged.set(item.name, item);
    }

    for (const item of substituteSessions) {
      merged.set(item.id, item);
    }

    const finalSessions = Array.from(merged.values());

    // Nếu đi từ trang điểm danh học viên sang thì chỉ mở đúng lớp vừa lưu.
    // Nếu mở /teacher-session trực tiếp thì vẫn giữ hành vi cũ: hiện tất cả lớp hợp lệ.
    const sessionsToShow = requestedClassId
      ? finalSessions.filter((item) => item.classId === requestedClassId)
      : finalSessions;

    setSessions(sessionsToShow);

    // 3. Lấy các buổi đã chấm công của đúng các lớp đang hiển thị.
    const regularClassIds = sessionsToShow
      .filter((item) => item.teachingType === "regular")
      .map((item) => item.classId);

    const { data: attendanceData, error: attendanceError } =
      regularClassIds.length > 0
        ? await supabase
            .from("teacher_attendance")
            .select("class_id,status")
            .eq("teacher_id", currentTeacherId)
            .eq("attendance_date", date)
            .in("class_id", regularClassIds)
        : { data: [], error: null };

    if (attendanceError) {
      console.error(attendanceError);
    }

    const confirmedMap: Record<string, boolean> = {};

    (attendanceData ?? []).forEach((item) => {
      confirmedMap[`regular-${item.class_id}`] =
        item.status === "taught";
    });

    // Kiểm tra các buổi dạy thay đã được ghi nhận
    // thông qua SECURITY DEFINER RPC, không đọc trực tiếp bảng teacher_work_sessions.
    const {
      data: workStatusData,
      error: workStatusError,
    } = await supabase.rpc("get_teacher_work_session_status", {
      p_session_date: date,
    });

    if (workStatusError) {
      console.error(workStatusError);
    } else {
      const workRows = workStatusData ?? [];

      const shownSubstituteSessions = sessionsToShow.filter(
        (item) => item.teachingType === "substitute"
      );

      for (const item of shownSubstituteSessions) {
        const alreadyRecorded = workRows.some(
          (row: {
            class_id: string;
            session_date: string;
            actual_teacher_id: string;
            teaching_type: string;
            substitution_request_id: string | null;
          }) =>
            row.class_id === item.classId &&
            row.session_date === date &&
            row.actual_teacher_id === currentTeacherId &&
            row.teaching_type === "substitute" &&
            row.substitution_request_id === item.requestId
        );

        if (alreadyRecorded) {
          confirmedMap[item.id] = true;
        }
      }
    }

    setConfirmed(confirmedMap);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function confirmSession(session: SessionItem) {
    if (!teacherId) {
      alert("Không xác định được tài khoản giáo viên.");
      return;
    }

    // Dùng đúng ngày đang mở trên trang.
    // Khi đi từ Điểm danh học viên sang, đây chính là ngày vừa điểm danh.
    const attendanceDate = sessionDate;

    setSavingId(session.id);

    // Dạy thay:
    // create_teacher_work_session() tự kiểm tra request đã được Admin duyệt,
    // đúng lớp, đúng ngày và đúng giáo viên.
    if (session.teachingType === "substitute") {
      if (!session.requestId) {
        alert("❌ Không xác định được yêu cầu dạy thay.");
        setSavingId("");
        return;
      }

      const { error } = await supabase.rpc(
        "create_teacher_work_session",
        {
          p_class_id: session.classId,
          p_session_date: attendanceDate,
          p_standing_teacher_id: session.standingTeacherId,
          p_actual_teacher_id: teacherId,
          p_teaching_type: "substitute",
          p_substitution_request_id: session.requestId,
        }
      );

      setSavingId("");

      if (error) {
        console.error(error);
        alert("❌ Không thể chấm công buổi dạy: " + error.message);
        return;
      }

      setConfirmed((current) => ({
        ...current,
        [session.id]: true,
      }));

      alert("✅ Đã chấm công buổi dạy thay.");
      window.dispatchEvent(new Event("teacher-attendance-updated"));
      await loadData();
      return;
    }

    // Giáo viên đứng lớp bình thường.
    // Dùng RPC để ghi ĐỒNG THỜI teacher_attendance + teacher_work_sessions.
    const classId = session.id.replace("regular-", "");

    const { error } = await supabase.rpc(
      "confirm_teacher_work_session",
      {
        p_class_id: classId,
        p_session_date: attendanceDate,
      }
    );

    setSavingId("");

    if (error) {
      console.error("confirm_teacher_work_session:", error);

      const message = error.message || "";

      if (
        message.includes("row-level security") ||
        message.includes("được Admin duyệt")
      ) {
        alert(
          "❌ Bạn không được chấm công buổi dạy này. " +
          "Buổi này đã được Admin duyệt cho giáo viên khác dạy thay."
        );
      } else {
        alert("❌ Không thể chấm công buổi dạy: " + message);
      }

      return;
    }

    setConfirmed((current) => ({
      ...current,
      [session.id]: true,
    }));

    alert("✅ Đã chấm công buổi dạy.");
    window.dispatchEvent(new Event("teacher-attendance-updated"));
    await loadData();
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section>
        <div className="text-xs font-black uppercase tracking-widest text-blue-600">
          Giáo viên
        </div>

        <h1 className="mt-1 text-2xl font-black text-slate-900">
          ✅ Chấm công
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Chấm công các lớp bạn được phân công và các buổi dạy thay đã được
          Admin duyệt cho ngày đang chọn.
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="text-sm font-bold text-slate-700">
          {isToday ? "📅 Hôm nay" : "📅 Ngày điểm danh"}
        </div>

        <div className="mt-2 text-xl font-black text-slate-900">
          {sessionDayLabel} · {sessionDate.split("-").reverse().join("/")}
        </div>

        <div className="mt-1 text-sm text-slate-500">
          Chấm công đúng lớp và ngày vừa điểm danh. Hệ thống vẫn kiểm tra quyền và kỳ lương ở database.
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-slate-500">
          Đang tải...
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-slate-500">
          Không có lớp phù hợp để chấm công cho ngày này.
        </div>
      ) : (
        <section className="space-y-3">
          {sessions.map((item) => {
            const isConfirmed = confirmed[item.id];

            return (
              <div
                key={item.id}
                className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    {item.name}
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    {sessionDayLabel}
                    {item.schedule_start && item.schedule_end
                      ? ` · ${String(item.schedule_start).slice(
                          0,
                          5
                        )}–${String(item.schedule_end).slice(0, 5)}`
                      : ""}
                  </div>

                  {item.teachingType === "substitute" && (
                    <div className="mt-1 text-sm font-semibold text-blue-700">
                      🔄 Dạy thay · GV đứng lớp:{" "}
                      {item.standingTeacherName}
                    </div>
                  )}

                  <div className="mt-1 text-sm text-slate-500">
                    {isConfirmed
                      ? "Buổi dạy đã được chấm công."
                      : "Chưa chấm công buổi dạy."}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => confirmSession(item)}
                  disabled={
                    isConfirmed || savingId === item.id
                  }
                  className={`min-h-12 w-full rounded-xl px-5 py-3 text-base font-bold sm:w-auto ${
                    isConfirmed
                      ? "cursor-default bg-green-100 text-green-700"
                      : "bg-slate-900 text-white hover:opacity-90"
                  } disabled:opacity-70`}
                >
                  {savingId === item.id
                      ? "Đang lưu..."
                    : isConfirmed
                      ? "✅ Đã chấm công"
                      : "Chấm công buổi này"}
                </button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
