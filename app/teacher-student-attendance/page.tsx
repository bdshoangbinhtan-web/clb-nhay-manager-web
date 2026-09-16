
"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { vietnamToday } from "@/lib/vietnam-date";

type ClassItem = {

  id: string;

  name: string;

};

type Student = {

  id: string;

  full_name: string;

};

const STATUS = {

  present: "Có mặt",

  absent: "Vắng",

  excused: "Có phép",

} as const;

export default function TeacherStudentAttendancePage() {

  const supabase = useMemo(() => createClient(), []);

  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [students, setStudents] = useState<Student[]>([]);

  const [classId, setClassId] = useState("");

  const [date, setDate] = useState(

    vietnamToday()

  );

  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  const [loadingClasses, setLoadingClasses] = useState(true);

  const [loadingStudents, setLoadingStudents] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

    useEffect(() => {
      let cancelled = false;

      async function loadClasses() {
        setLoadingClasses(true);
        setError("");

        const { data, error } = await supabase
          .from("classes")
          .select("id,name")
          .eq("status", "active")
          .order("name");

        if (cancelled) return;

        if (error) {
          console.error(error);
          setError("Không tải được lớp của bạn.");
          setClasses([]);
          setLoadingClasses(false);
          return;
        }

        // Chỉ lấy buổi dạy thay đã được Admin duyệt ĐÚNG ngày đang chọn.
        const { data: substituteSessions, error: substituteError } =
          await supabase.rpc("get_teacher_approved_substitution_sessions");

        if (cancelled) return;

        if (substituteError) {
          console.error("SUBSTITUTE LOAD ERROR:", substituteError);
        }

        const regularClasses = data ?? [];
        const approvedSubstitutionsForDate = (substituteSessions ?? []).filter(
          (item: { session_date?: string | null }) =>
            item.session_date === date
        );

        const substituteClassIds = new Set(
          approvedSubstitutionsForDate
            .map((item: { class_id?: string }) => item.class_id)
            .filter((id: string | undefined): id is string => Boolean(id))
        );

        let substituteClasses: ClassItem[] = [];

        if (substituteClassIds.size > 0) {
          const { data: extraClasses, error: extraClassError } = await supabase
            .from("classes")
            .select("id,name")
            .in("id", Array.from(substituteClassIds))
            .eq("status", "active");

          if (cancelled) return;

          if (extraClassError) {
            console.error("SUBSTITUTE CLASS ERROR:", extraClassError);
          } else {
            substituteClasses = extraClasses ?? [];
          }
        }

        const merged = [...regularClasses, ...substituteClasses].filter(
          (item, index, array) =>
            array.findIndex((x) => x.id === item.id) === index
        );

        setClasses(merged);

        const requestedClassId =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("classId")
            : null;

        const requestedClass = merged.find(
          (item) => item.id === requestedClassId
        );

        if (requestedClass) {
          setClassId(requestedClass.id);
        } else if (merged.length > 0) {
          setClassId((current) =>
            merged.some((item) => item.id === current) ? current : merged[0].id
          );
        } else {
          setClassId("");
        }

        setLoadingClasses(false);
      }

      loadClasses();

      return () => {
        cancelled = true;
      };
    }, [date, supabase]);

    
useEffect(() => {

    let cancelled = false;

    async function loadStudents() {

      if (!classId) {

        setStudents([]);

        setStatusMap({});

        setLoadingStudents(false);

        return;

      }

      setLoadingStudents(true);

      setError("");

      const { data: members, error: memberError } = await supabase

        .from("class_students")

        .select("student_id")

        .eq("class_id", classId)

        .eq("status", "active");

      if (cancelled) return;

      if (memberError) {

        console.error(memberError);

        setError("Không tải được danh sách học viên.");

        setStudents([]);

        setStatusMap({});

        setLoadingStudents(false);

        return;

      }

      const ids = (members ?? []).map((item) => item.student_id);

      if (!ids.length) {

        setStudents([]);

        setStatusMap({});

        setLoadingStudents(false);

        return;

      }

      const [

        { data: studentData, error: studentError },

        { data: attendanceData, error: attendanceError },

      ] = await Promise.all([

        supabase

          .from("students")

          .select("id,full_name")

          .in("id", ids)

          .eq("status", "active")

          .order("full_name"),

        supabase

          .from("attendance")

          .select("student_id,status")

          .eq("class_id", classId)

          .eq("attendance_date", date),

      ]);

      if (cancelled) return;

      if (studentError || attendanceError) {

        console.error(studentError || attendanceError);

        setError("Không tải được dữ liệu điểm danh.");

        setStudents([]);

        setStatusMap({});

        setLoadingStudents(false);

        return;

      }

      const map: Record<string, string> = {};

      (attendanceData ?? []).forEach((item) => {

        map[item.student_id] = item.status;

      });

      setStudents(studentData ?? []);

      setStatusMap(map);

      setLoadingStudents(false);

    }

    loadStudents();

    return () => {
      cancelled = true;
    };

  }, [classId, date, supabase]);

  function setStudentStatus(studentId: string, status: string) {

    setStatusMap((previous) => ({

      ...previous,

      [studentId]: status,

    }));

  }

  function markAll(status: string) {

    const next: Record<string, string> = {};

    students.forEach((student) => {

      next[student.id] = status;

    });

    setStatusMap(next);

  }

  async function saveAttendance() {

    if (!classId) {

      alert("Hãy chọn lớp.");

      return;

    }

    if (!students.length) {

      alert("Lớp chưa có học viên.");

      return;

    }

    setSaving(true);

    const rows = students.map((student) => ({

      student_id: student.id,

      class_id: classId,

      attendance_date: date,

      status: statusMap[student.id] || "present",

    }));

    const { error } = await supabase

      .from("attendance")

      .upsert(rows, {

        onConflict: "student_id,class_id,attendance_date",

      });

    setSaving(false);

    if (error) {

      console.error(error);

      alert("Không thể lưu điểm danh: " + error.message);

      return;

    }

    alert("✅ Đã lưu điểm danh.");

  }

  const presentCount = students.filter(

    (student) => (statusMap[student.id] || "present") === "present"

  ).length;

  const absentCount = students.filter(

    (student) => statusMap[student.id] === "absent"

  ).length;

  const excusedCount = students.filter(

    (student) => statusMap[student.id] === "excused"

  ).length;

  const selectedClass = classes.find((item) => item.id === classId);

  return (

    <div className="space-y-6">

      <section>

        <div className="text-xs font-black uppercase tracking-widest text-blue-600">

          Giáo viên

        </div>

        <h1 className="mt-1 text-2xl font-black text-slate-900">

          📝 Điểm danh học viên

        </h1>

        <p className="mt-1 text-sm text-slate-500">

          {selectedClass

            ? selectedClass.name

            : "Các lớp bạn được phân công"}

        </p>

      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">

        <div className="grid gap-4 md:grid-cols-2">

          <div>

            <label className="mb-2 block text-sm font-bold text-slate-700">

              Lớp

            </label>

            <select

              value={classId}

              onChange={(event) => {

                setClassId(event.target.value);

                const url = new URL(window.location.href);

                url.searchParams.set("classId", event.target.value);

                window.history.replaceState({}, "", url.toString());

              }}

              disabled={loadingClasses || classes.length === 0}

              className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"

            >

              {loadingClasses ? (

                <option>Đang tải lớp...</option>

              ) : classes.length === 0 ? (

                <option value="">Chưa có lớp được phân công</option>

              ) : (

                classes.map((item) => (

                  <option key={item.id} value={item.id}>

                    {item.name}

                  </option>

                ))

              )}

            </select>

          </div>

          <div>

            <label className="mb-2 block text-sm font-bold text-slate-700">

              Ngày học

            </label>

            <input

              type="date"

              value={date}

              onChange={(event) => setDate(event.target.value)}

              className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"

            />

          </div>

        </div>

      </section>

      {error && (

        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">

          {error}

        </div>

      )}

      {loadingStudents ? (

        <div className="rounded-2xl border bg-white p-6 text-slate-500">

          Đang tải học viên...

        </div>

      ) : students.length === 0 ? (

        <div className="rounded-2xl border bg-white p-6 text-slate-500">

          Lớp này hiện không có học viên đang hoạt động.

        </div>

      ) : (

        <>

          <section className="grid grid-cols-3 gap-3">

            <div className="rounded-xl border bg-white p-4 text-center shadow-sm">

              <div className="text-2xl font-black">{presentCount}</div>

              <div className="text-sm text-slate-500">Có mặt</div>

            </div>

            <div className="rounded-xl border bg-white p-4 text-center shadow-sm">

              <div className="text-2xl font-black">{absentCount}</div>

              <div className="text-sm text-slate-500">Vắng</div>

            </div>

            <div className="rounded-xl border bg-white p-4 text-center shadow-sm">

              <div className="text-2xl font-black">{excusedCount}</div>

              <div className="text-sm text-slate-500">Có phép</div>

            </div>

          </section>

          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">

            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">

              <div className="font-bold">

                {students.length} học viên

              </div>

              <div className="flex flex-wrap gap-2">

                <button

                  type="button"

                  onClick={() => markAll("present")}

                  className="rounded-lg border px-3 py-2 text-sm font-bold"

                >

                  Tất cả có mặt

                </button>

                <button

                  type="button"

                  onClick={() => markAll("absent")}

                  className="rounded-lg border px-3 py-2 text-sm font-bold"

                >

                  Tất cả vắng

                </button>

              </div>

            </div>

            <div className="divide-y">

              {students.map((student, index) => {

                const currentStatus =

                  statusMap[student.id] || "present";

                return (

                  <div

                    key={student.id}

                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"

                  >

                    <div className="flex items-center gap-3">

                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold">

                        {index + 1}

                      </div>

                      <div className="font-semibold text-slate-900">

                        {student.full_name}

                      </div>

                    </div>

                    <div className="flex gap-2">

                      {Object.entries(STATUS).map(

                        ([status, label]) => (

                          <button

                            key={status}

                            type="button"

                            onClick={() =>

                              setStudentStatus(student.id, status)

                            }

                            className={`rounded-lg px-3 py-2 text-sm font-bold ${

                              currentStatus === status

                                ? "bg-slate-900 text-white"

                                : "border bg-white text-slate-600"

                            }`}

                          >

                            {label}

                          </button>

                        )

                      )}

                    </div>

                  </div>

                );

              })}

            </div>

            <div className="border-t bg-slate-50 p-4">

              <button

                type="button"

                onClick={saveAttendance}

                disabled={saving}

                className="w-full rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50"

              >

                {saving ? "Đang lưu..." : "💾 Lưu điểm danh"}

              </button>

            </div>

          </section>

        </>

      )}

    </div>

  );

}
