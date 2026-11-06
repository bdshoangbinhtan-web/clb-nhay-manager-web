/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { activeStaffRole } from "@/lib/active-staff-role";
import { compareStudentsNewestFirst } from "@/lib/student-list-order";
import {
  countClassStudentStatuses,
  filterClassStudentsByStatus,
  isStudentStudying,
  type ClassStudentStatusFilter,
} from "@/lib/class-student-status";
import { useRealtimeRefresh } from "@/components/realtime/global-realtime-provider";

type ClassItem = {
  id: string;
  name: string;
  branch_id: string;
  monthly_fee: number;
  status: string;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
};

type Branch = {
  id: string;
  name: string;
};

type Student = {
  id: string;
  student_code: string;
  full_name: string;
  status: "active" | "inactive" | "reserved";
  join_date: string | null;
  created_at: string | null;
  parent_phone: string | null;
};

type Teacher = {
  id: string;
  full_name: string;
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ/tháng";
}

function formatSchedule(
  days: string[] | null,
  start: string | null,
  end: string | null
) {
  if (!days?.length) return "Chưa thiết lập lịch học";

  const dayText = days.map((day) => DAY_LABELS[day] ?? day).join(" • ");

  if (!start || !end) return dayText;

  return `${dayText} • ${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const loadRequestRef = useRef(0);

  const classId = String(params.id);

  const [classItem, setClassItem] = useState<ClassItem | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);
  const [role, setRole] = useState<"admin" | "manager" | "">("");
  const [statusFilter, setStatusFilter] = useState<ClassStudentStatusFilter>("all");
  const [updatingStudentId, setUpdatingStudentId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [savingTeacher, setSavingTeacher] = useState(false);

  const loadClass = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");

    let classData = null;
    let classError = null;

    // Khi chuyển thẳng từ Dashboard, Supabase session đôi lúc chưa
    // sẵn sàng ở lần query đầu tiên. Thử lại vài lần trước khi báo lỗi.
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await supabase
        .from("classes")
        .select(
          "id,name,branch_id,monthly_fee,status,schedule_days,schedule_start,schedule_end"
        )
        .eq("id", classId)
        .maybeSingle();

      classData = result.data;
      classError = result.error;

      if (requestId !== loadRequestRef.current) return;

      if (classData || classError) break;

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (classError || !classData) {
      console.error(classError);
      setError(classError?.message ?? "Không tìm thấy lớp học.");
      setLoading(false);
      return;
    }

    setClassItem(classData);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile, error: profileError } = user
      ? await supabase.from("profiles").select("role,is_active").eq("id", user.id).single()
      : { data: null, error: null };
    if (requestId !== loadRequestRef.current) return;
    const currentRole = activeStaffRole(profileError ? null : profile);
    setRole(currentRole);
    if (!currentRole) {
      setError("Không xác định được quyền truy cập. Vui lòng tải lại trang.");
      setLoading(false);
      return;
    }

    const classTeacherSelection = "teacher_id, teachers(id,full_name)";
    const teacherSelection = "id,full_name";

    const [{ data: branchData }, { data: classStudents }, { data: classTeachers }, { data: allTeachers }] =
      await Promise.all([
        supabase
          .from("branches")
          .select("id,name")
          .eq("id", classData.branch_id)
          .maybeSingle(),

        supabase
          .from("class_students")
          .select("student_id, students!inner(id,student_code,full_name,status,join_date,created_at,parent_phone)")
          .eq("class_id", classId)
          .eq("status", "active"),

        supabase
          .from("class_teachers")
          .select(classTeacherSelection)
          .eq("class_id", classId),

        supabase
          .from("teachers")
          .select(teacherSelection)
          .eq("status", "active")
          .order("full_name"),
    ]);

    if (requestId !== loadRequestRef.current) return;

    setBranch(branchData);

    const studentList = (classStudents ?? [])
      .flatMap((row: any) => row.students ?? [])
      .filter((student: Student) => student?.id && student?.full_name)
      .sort(compareStudentsNewestFirst);

    setStudents(studentList);

    const teacherList = (classTeachers ?? [])
      .flatMap((row: any) => row.teachers ?? [])
      .filter((teacher: Teacher) => teacher?.id && teacher?.full_name);

    setTeachers(teacherList);
    setAvailableTeachers((allTeachers ?? []) as unknown as Teacher[]);

    setLoading(false);
  }, [classId, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        setError("Phiên đăng nhập chưa sẵn sàng. Vui lòng thử lại.");
        setLoading(false);
        return;
      }

      await loadClass();
    }

    init();

    return () => {
      cancelled = true;
      loadRequestRef.current += 1;
    };
  }, [loadClass, supabase]);

  useRealtimeRefresh(["classes", "students"], loadClass);

  const studentStatusCounts = useMemo(() => countClassStudentStatuses(students), [students]);
  const visibleStudents = useMemo(
    () => filterClassStudentsByStatus(students, statusFilter),
    [students, statusFilter],
  );

  async function addTeacher() {
    if (!selectedTeacherId) {
      alert("Vui lòng chọn giáo viên.");
      return;
    }

    if (teachers.some((teacher) => teacher.id === selectedTeacherId)) {
      alert("Giáo viên này đã có trong lớp.");
      return;
    }

    setSavingTeacher(true);

    const { error: insertError } = await supabase
      .from("class_teachers")
      .insert({
        class_id: classId,
        teacher_id: selectedTeacherId,
      });

    setSavingTeacher(false);

    if (insertError) {
      console.error(insertError);
      alert(
        "❌ Không thể thêm giáo viên.\n\n" + insertError.message
      );
      return;
    }

    const teacher = availableTeachers.find(
      (item) => item.id === selectedTeacherId
    );

    if (teacher) {
      setTeachers((current) => [...current, teacher]);
    }

    setSelectedTeacherId("");
    setShowTeacherModal(false);

    alert("✅ Đã thêm giáo viên vào lớp.");
  }

  async function removeTeacher(teacherId: string) {
    const teacher = teachers.find(
      (item) => item.id === teacherId
    );

    if (
      !window.confirm(
        `Gỡ ${teacher?.full_name ?? "giáo viên này"} khỏi lớp?`
      )
    ) {
      return;
    }

    const { error: removeError } = await supabase
      .from("class_teachers")
      .delete()
      .eq("class_id", classId)
      .eq("teacher_id", teacherId);

    if (removeError) {
      console.error(removeError);
      alert(
        "❌ Không thể gỡ giáo viên.\n\n" +
          removeError.message
      );
      return;
    }

    setTeachers((current) =>
      current.filter((item) => item.id !== teacherId)
    );

    alert("✅ Đã gỡ giáo viên khỏi lớp.");
  }

  async function changeStudentStatus(student: Student, nextStatus: "active" | "inactive") {
    if (!role || updatingStudentId || student.status === nextStatus) return;

    const pausing = nextStatus === "inactive";
    const accepted = window.confirm(
      pausing
        ? `Tạm ngưng học viên ${student.full_name}?\n\nThay đổi này áp dụng cho trạng thái học viên trên toàn hệ thống.\nHọc phí đã thu, công nợ và các khoản bảo lưu/hoàn tiền KHÔNG tự thay đổi.\n\nNếu cần xử lý học phí, hãy dùng chức năng trong hồ sơ học viên.`
        : `Chuyển ${student.full_name} về trạng thái Đang học?\n\nThay đổi áp dụng cho toàn hệ thống. Học phí không tự điều chỉnh.`,
    );
    if (!accepted) return;

    setUpdatingStudentId(student.id);

    try {
      // Guard against concurrent edits: do not overwrite a status changed on another device.
      const { data, error: updateError } = await supabase
        .from("students")
        .update({ status: nextStatus })
        .eq("id", student.id)
        .eq("status", student.status)
        .select("id,status")
        .maybeSingle();

      if (updateError) throw new Error(updateError.message);
      if (!data) throw new Error("Trạng thái đã được cập nhật ở thiết bị khác hoặc bạn không có quyền sửa.");

      setStudents((current) => current.map((item) =>
        item.id === student.id ? { ...item, status: nextStatus } : item,
      ));
    } catch (updateError) {
      alert(
        "Không thể cập nhật trạng thái học viên.\n\n" +
        (updateError instanceof Error ? updateError.message : "Vui lòng thử lại."),
      );
      await loadClass();
    } finally {
      setUpdatingStudentId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <div className="rounded-3xl bg-white p-8 text-slate-500 shadow-sm">
          Đang tải lớp học...
        </div>
      </main>
    );
  }

  if (error || !classItem) {
    return (
      <main className="min-h-screen p-8">
        <button
          onClick={() => router.push("/branches")}
          className="mb-6 font-bold text-blue-600"
        >
          ← Cơ sở & Lớp
        </button>

        <div className="rounded-3xl bg-white p-8 text-red-600 shadow-sm">
          {error || "Không tìm thấy lớp học."}
        </div>
      </main>
    );
  }

  const teachersNotInClass = availableTeachers.filter(
    (teacher) =>
      !teachers.some((item) => item.id === teacher.id)
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 lg:p-8">
      <div className="mb-8">
        <button
          onClick={() => router.push("/branches")}
          className="mb-5 font-bold text-slate-600 hover:text-blue-600"
        >
          ← Cơ sở & Lớp
        </button>

        <div className="text-sm font-bold text-slate-500">
          🏢 {branch?.name ?? "Chưa xác định cơ sở"}
        </div>

        <h1 className="mt-2 text-4xl font-black text-slate-900">
          {classItem.name}
        </h1>

        <div className="mt-4 flex flex-wrap gap-3">
          <span className="rounded-full bg-white px-4 py-2 font-bold text-slate-700 shadow-sm">
            💰 {formatMoney(Number(classItem.monthly_fee))}
          </span>

          <span className="rounded-full bg-white px-4 py-2 font-bold text-slate-700 shadow-sm">
            {classItem.status === "active"
              ? "🟢 Đang hoạt động"
              : "⚪ Tạm ngưng"}
          </span>
        </div>
      </div>

      <section className="mb-6 rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(30,45,70,.06)]">
        <div className="text-sm font-black uppercase tracking-wider text-blue-600">
          📅 Lịch học
        </div>

        <div className="mt-3 text-2xl font-black text-slate-900">
          {formatSchedule(
            classItem.schedule_days,
            classItem.schedule_start,
            classItem.schedule_end
          )}
        </div>

        {!classItem.schedule_days?.length && (
          <div className="mt-2 text-sm text-slate-400">
            Vào nút Sửa lớp để thiết lập ngày và giờ học.
          </div>
        )}
      </section>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(30,45,70,.06)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black text-slate-900">
              🧑‍🎓 Học viên
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-600">
              Tổng: {studentStatusCounts.all}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" aria-label="Lọc trạng thái học viên">
            {([
              { id: "all", label: "Tất cả", count: studentStatusCounts.all },
              { id: "active", label: "Đang học", count: studentStatusCounts.active },
              { id: "paused", label: "Tạm ngưng", count: studentStatusCounts.paused },
            ] as const).map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={statusFilter === filter.id}
                onClick={() => setStatusFilter(filter.id)}
                className={`rounded-xl border px-3 py-2 text-xs font-black transition sm:text-sm ${
                  statusFilter === filter.id
                    ? filter.id === "active"
                      ? "border-green-500 bg-green-100 text-green-800"
                      : filter.id === "paused"
                        ? "border-orange-400 bg-orange-100 text-orange-800"
                        : "border-blue-500 bg-blue-100 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>

          {students.length === 0 ? (
            <p className="mt-6 text-slate-500">Chưa có học viên.</p>
          ) : visibleStudents.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Không có học viên thuộc trạng thái này.</p>
          ) : (
            <div className="mt-5 w-full overflow-x-auto">
              <div className="min-w-[490px]">
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_108px_108px] items-center gap-2 px-3 text-xs font-black text-slate-500">
                  <span>Học viên</span>
                  <span className="text-center text-green-700">Đang học</span>
                  <span className="text-center text-orange-700">Tạm ngưng</span>
                </div>

                <div className="space-y-2">
                  {visibleStudents.map((student) => {
                    const active = isStudentStudying(student.status);
                    const updating = updatingStudentId === student.id;

                    return (
                      <div
                        key={student.id}
                        className="grid grid-cols-[minmax(0,1fr)_108px_108px] items-center gap-2 rounded-2xl bg-slate-50 p-2.5 text-slate-800 sm:p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <Link
                              href={`/students/${student.id}`}
                              title="Mở hồ sơ học viên"
                              className="break-words text-sm font-black hover:text-blue-700 hover:underline"
                            >
                              {student.full_name}
                            </Link>
                            {student.parent_phone?.trim() ? (
                              <span className="whitespace-nowrap text-xs font-semibold text-slate-600">
                                📞 {student.parent_phone}
                              </span>
                            ) : null}
                            <span className="text-xs font-black text-blue-600">
                              {student.student_code}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={updatingStudentId !== null || active}
                          aria-pressed={active}
                          title={active ? "Học viên đang học" : "Nhấn để chuyển sang đang học"}
                          onClick={() => void changeStudentStatus(student, "active")}
                          className={`min-h-9 rounded-xl border px-2 py-1.5 text-xs font-black transition disabled:cursor-default ${
                            active
                              ? "border-green-400 bg-green-100 text-green-800"
                              : "border-slate-200 bg-white text-slate-500 hover:border-green-300 hover:bg-green-50"
                          }`}
                        >
                          {updating ? "Đang lưu..." : "✓ Đang học"}
                        </button>

                        <button
                          type="button"
                          disabled={updatingStudentId !== null || !active}
                          aria-pressed={!active}
                          title={!active ? "Học viên đang tạm ngưng" : "Nhấn để tạm ngưng"}
                          onClick={() => void changeStudentStatus(student, "inactive")}
                          className={`min-h-9 rounded-xl border px-2 py-1.5 text-xs font-black transition disabled:cursor-default ${
                            !active
                              ? "border-orange-400 bg-orange-100 text-orange-800"
                              : "border-slate-200 bg-white text-slate-500 hover:border-orange-300 hover:bg-orange-50"
                          }`}
                        >
                          {updating ? "Đang lưu..." : "Ⅱ Tạm ngưng"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <p className="mt-3 text-xs font-medium text-slate-500">
            Đổi trạng thái áp dụng cho hồ sơ học viên. Học phí và lịch sử thu không tự thay đổi.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(30,45,70,.06)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-slate-900">
                👨‍🏫 Giáo viên
              </h2>

              <span className="rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-500">
                {teachers.length}
              </span>
            </div>

            <button
              onClick={() => setShowTeacherModal(true)}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800"
            >
              + Thêm giáo viên
            </button>
          </div>

          {teachers.length === 0 ? (
            <p className="mt-6 text-slate-500">
              Chưa có giáo viên.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {teachers.map((teacher) => (
                <div
                  key={teacher.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <div>
                    <div className="font-bold text-slate-800">
                      {teacher.full_name}
                    </div>


                  </div>

                  <button
                    onClick={() => removeTeacher(teacher.id)}
                    className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-100"
                  >
                    Gỡ
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showTeacherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-900">
                ➕ Thêm giáo viên
              </h3>

              <button
                onClick={() => setShowTeacherModal(false)}
                className="rounded-xl bg-slate-100 px-3 py-2 font-bold text-slate-500"
              >
                ✕
              </button>
            </div>

            <div className="mt-6">
              <label className="text-sm font-bold text-slate-500">
                Chọn giáo viên
              </label>

              <select
                value={selectedTeacherId}
                onChange={(e) =>
                  setSelectedTeacherId(e.target.value)
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none"
              >
                <option value="">
                  -- Chọn giáo viên --
                </option>

                {teachersNotInClass.map((teacher) => (
                  <option
                    key={teacher.id}
                    value={teacher.id}
                  >
                    {teacher.full_name}
                  </option>
                ))}
              </select>

              {teachersNotInClass.length === 0 && (
                <p className="mt-3 text-sm font-semibold text-amber-600">
                  Tất cả giáo viên đang hoạt động đã được
                  gán vào lớp.
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setSelectedTeacherId("");
                  setShowTeacherModal(false);
                }}
                className="rounded-2xl bg-slate-100 px-5 py-3 font-bold text-slate-600"
              >
                Hủy
              </button>

              <button
                onClick={addTeacher}
                disabled={
                  savingTeacher ||
                  teachersNotInClass.length === 0
                }
                className="rounded-2xl bg-slate-900 px-6 py-3 font-black text-white disabled:opacity-50"
              >
                {savingTeacher
                  ? "Đang lưu..."
                  : "Lưu giáo viên"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
