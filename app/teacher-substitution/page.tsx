"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamToday, vietnamTodayLabel } from "@/lib/vietnam-date";

type Teacher = {
  id: string;
  full_name: string;
};

type ClassItem = {
  id: string;
  name: string;
  branch_id: string | null;
  schedule_days: string[] | null;
  status: string;
};

type ClassTeacherRow = {
  class_id: string;
  teacher_id: string;
  is_primary: boolean;
  classes: ClassItem | null;
  teachers: Teacher | null;
};

type RequestRow = {
  id: string;
  class_id: string;
  standing_teacher_id: string;
  substitute_teacher_id: string;
  session_date: string;
  status: string;
  note: string | null;
  classes: { name: string } | null;
  standing_teacher: { full_name: string } | null;
};

function todayDate() {
  return vietnamToday();
}

function todayLabel() {
  return vietnamTodayLabel();
}

export default function TeacherSubstitutionPage() {
  const supabase = useMemo(() => createClient(), []);
  const sendingRef = useRef(false);

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<ClassTeacherRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStandingTeacherId, setSelectedStandingTeacherId] =
    useState("");

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRequests = useCallback(async (teacherId: string) => {
    const { data, error } = await supabase
      .from("teacher_substitution_requests")
      .select(
        `
        id,
        class_id,
        standing_teacher_id,
        substitute_teacher_id,
        session_date,
        status,
        note,
        classes(name),
        standing_teacher:teachers!teacher_substitution_requests_standing_teacher_id_fkey(full_name)
        `
      )
      .eq("substitute_teacher_id", teacherId)
      .is("duplicate_of_id", null)
      .order("created_at", { ascending: false });

    if (!error) {
      setRequests((data ?? []) as unknown as RequestRow[]);
    }
  }, [supabase]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");
      setLoading(false);
      return;
    }

    const { data: teacherData, error: teacherError } = await supabase
      .from("teachers")
      .select("id,full_name")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .single();

    if (teacherError || !teacherData) {
      setError("Không tìm thấy tài khoản giáo viên.");
      setLoading(false);
      return;
    }

    setTeacher(teacherData);

    // Lấy TOÀN BỘ lớp đang hoạt động của cả 2 cơ sở
    // có lịch học hôm nay thông qua SECURITY DEFINER function.
    const { data: optionData, error: optionError } = await supabase
      .rpc("get_teacher_substitution_options");

    if (optionError) {
      setError(optionError.message);
      setLoading(false);
      return;
    }

    const options = (optionData ?? []).map((row: {
      class_id: string;
      class_name: string;
      branch_id: string | null;
      standing_teacher_id: string;
      standing_teacher_name: string;
    }) => ({
      class_id: row.class_id,
      teacher_id: row.standing_teacher_id,
      is_primary: true,
      classes: {
        id: row.class_id,
        name: row.class_name,
        branch_id: row.branch_id,
        schedule_days: [],
        status: "active",
      },
      teachers: {
        id: row.standing_teacher_id,
        full_name: row.standing_teacher_name,
      },
    }));

    setAssignments(options);

    if (options.length > 0) {
      setSelectedClassId(options[0].class_id);
      setSelectedStandingTeacherId(options[0].teacher_id);
    } else {
      setSelectedClassId("");
      setSelectedStandingTeacherId("");
    }

    await loadRequests(teacherData.id);

    setLoading(false);
  }, [loadRequests, supabase]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const eligibleClasses = useMemo(() => {
    const map = new Map<string, ClassTeacherRow>();

    for (const row of assignments) {
      const c = row.classes;

      if (!c) continue;
      if (c.status !== "active") continue;
      if (row.teacher_id === teacher?.id) continue;
      if (!row.teachers?.id) continue;

      if (!map.has(row.class_id)) {
        map.set(row.class_id, row);
      }
    }

    return Array.from(map.values());
  }, [assignments, teacher]);

  const standingTeachers = useMemo(() => {
    if (!selectedClassId) return [];

    return assignments
      .filter(
        (row) =>
          row.class_id === selectedClassId &&
          row.teacher_id !== teacher?.id &&
          row.teachers?.id
      )
      .map((row) => ({
        id: row.teacher_id,
        full_name: row.teachers!.full_name,
      }))
      .filter(
        (item, index, arr) =>
          arr.findIndex((x) => x.id === item.id) === index
      );
  }, [assignments, selectedClassId, teacher]);

  useEffect(() => {
    if (!selectedClassId) return;

    const currentStillValid = standingTeachers.some(
      (t) => t.id === selectedStandingTeacherId
    );

    if (!currentStillValid) {
      setSelectedStandingTeacherId(standingTeachers[0]?.id ?? "");
    }
  }, [selectedClassId, standingTeachers, selectedStandingTeacherId]);

  async function sendRequest() {
    if (!teacher || sendingRef.current) return;

    if (!selectedClassId || !selectedStandingTeacherId) {
      setError("Vui lòng chọn lớp và giáo viên đứng lớp.");
      return;
    }

    const existingRequest = requests.find(
      (request) =>
        request.class_id === selectedClassId &&
        request.session_date === todayDate()
    );

    if (existingRequest) {
      setError("Bạn đã gửi yêu cầu dạy thay cho lớp này hôm nay.");
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setError("");
    setMessage("");

    try {
      const { error: insertError } = await supabase
        .from("teacher_substitution_requests")
        .insert({
          class_id: selectedClassId,
          standing_teacher_id: selectedStandingTeacherId,
          substitute_teacher_id: teacher.id,
          session_date: todayDate(),
          status: "pending",
          note: "Giáo viên đăng ký dạy thay hôm nay.",
        });

      if (insertError) {
        if (
          insertError.code === "23505" ||
          insertError.message.includes(
            "teacher_substitution_requests_one_per_class_day"
          )
        ) {
          setError("Bạn đã gửi yêu cầu dạy thay cho lớp này hôm nay.");
        } else {
          setError(insertError.message);
        }
        return;
      }

      setMessage("Đã gửi yêu cầu dạy thay. Chờ Admin duyệt.");
      await loadRequests(teacher.id);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const selectedClass = eligibleClasses.find(
    (row) => row.class_id === selectedClassId
  )?.classes;

  const selectedExistingRequest = requests.find(
    (request) =>
      request.class_id === selectedClassId &&
      request.session_date === todayDate()
  );

  if (loading) {
    return (
      <main className="p-6">
        <div className="rounded-xl border bg-white p-6">
          Đang tải...
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Tôi dạy thay hôm nay</h1>
        <p className="mt-1 text-sm text-gray-500">{todayLabel()}</p>
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">
          Đăng ký dạy thay
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Chỉ chọn được lớp có lịch học hôm nay và không phải lớp bạn đang
          được phân công.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Lớp
            </label>

            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStandingTeacherId("");
                setMessage("");
                setError("");
              }}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">-- Chọn lớp --</option>

              {eligibleClasses.map((row) => (
                <option key={row.class_id} value={row.class_id}>
                  {row.classes?.name ?? "Lớp"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Giáo viên đứng lớp
            </label>

            <select
              value={selectedStandingTeacherId}
              onChange={(e) =>
                setSelectedStandingTeacherId(e.target.value)
              }
              disabled={!selectedClassId}
              className="w-full rounded-lg border px-3 py-2 disabled:bg-gray-100"
            >
              <option value="">-- Chọn giáo viên --</option>

              {standingTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedClass && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
            Bạn đang đăng ký dạy thay lớp{" "}
            <strong>{selectedClass.name}</strong> vào hôm nay.
          </div>
        )}

        {selectedExistingRequest && (
          <div className="mt-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
            Bạn đã gửi yêu cầu dạy thay cho lớp này hôm nay. Mỗi giáo viên
            chỉ được gửi một lần cho một lớp.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {message}
          </div>
        )}

        <button
          type="button"
          onClick={sendRequest}
          disabled={
            sending ||
            !selectedClassId ||
            !selectedStandingTeacherId ||
            Boolean(selectedExistingRequest)
          }
          className="mt-5 rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending
            ? "Đang gửi..."
            : selectedExistingRequest
              ? "Đã gửi yêu cầu cho lớp này"
              : "Gửi yêu cầu dạy thay"}
        </button>

        {eligibleClasses.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">
            Hôm nay không có lớp phù hợp để đăng ký dạy thay.
          </p>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">
          Yêu cầu dạy thay của tôi
        </h2>

        {requests.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            Chưa có yêu cầu nào.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {requests.map((request) => {
              const statusText =
                request.status === "approved"
                  ? "Đã duyệt"
                  : request.status === "rejected"
                    ? "Từ chối"
                    : request.status === "cancelled"
                      ? "Đã hủy"
                      : "Chờ duyệt";

              const statusClass =
                request.status === "approved"
                  ? "bg-green-100 text-green-700"
                  : request.status === "rejected"
                    ? "bg-red-100 text-red-700"
                    : request.status === "cancelled"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-yellow-100 text-yellow-700";

              return (
                <div
                  key={request.id}
                  className="rounded-xl border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {request.classes?.name ?? "Lớp"}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        Giáo viên đứng lớp:{" "}
                        {request.standing_teacher?.full_name ?? "—"}
                      </div>

                      <div className="text-sm text-gray-500">
                        Ngày: {request.session_date}
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}
                    >
                      {statusText}
                    </span>
                  </div>

                  {request.status === "approved" && (
                    <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                      Đã được Admin duyệt. Sau khi xác nhận buổi dạy,
                      hệ thống sẽ ghi nhận buổi dạy thay.
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
