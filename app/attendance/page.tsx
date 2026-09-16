"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamToday } from "@/lib/vietnam-date";

type Branch = { id: string; name: string };
type ClassItem = {
  id: string;
  name: string;
  branch_id: string;
  schedule_days: string[] | null;
};
type Student = { id: string; full_name: string };
type Attendance = {
  id: string;
  student_id: string;
  class_id: string;
  attendance_date: string;
  status: string;
};

const STATUS = {
  present: "Có mặt",
  absent: "Vắng",
  excused: "Có phép",
};

export default function AttendancePage() {
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);

  const [branchId, setBranchId] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(
    vietnamToday()
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  async function loadBase() {
    setLoading(true);

    const [
      { data: branchData, error: branchError },
      { data: classData, error: classError },
    ] = await Promise.all([
      supabase.from("branches").select("id,name").order("name"),
      supabase
        .from("classes")
        .select("id,name,branch_id,schedule_days")
        .eq("status", "active")
        .order("name"),
    ]);

    if (branchError) {
      alert(branchError.message);
      return;
    }

    if (classError) {
      alert(classError.message);
      return;
    }

    setBranches(branchData ?? []);
    setClasses(classData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadBase();
  }, []);

  const filteredClasses = useMemo(
    () =>
      classes.filter((c) => !branchId || c.branch_id === branchId),
    [classes, branchId]
  );

  async function loadStudents() {
    if (!classId) {
      setStudents([]);
      setAttendance([]);
      setStatusMap({});
      return;
    }

    setLoading(true);

    const { data: members, error: memberError } = await supabase
      .from("class_students")
      .select("student_id")
      .eq("class_id", classId)
      .eq("status", "active");

    if (memberError) {
      alert(memberError.message);
      setLoading(false);
      return;
    }

    const ids = (members ?? []).map((x) => x.student_id);

    if (!ids.length) {
      setStudents([]);
      setAttendance([]);
      setStatusMap({});
      setLoading(false);
      return;
    }

    const [{ data: studentData, error: studentError }, { data: attData, error: attError }] =
      await Promise.all([
        supabase
          .from("students")
          .select("id,full_name")
          .in("id", ids)
          .order("full_name"),

        supabase
          .from("attendance")
          .select("id,student_id,class_id,attendance_date,status")
          .eq("class_id", classId)
          .eq("attendance_date", date),
      ]);

    if (studentError) {
      alert(studentError.message);
      setLoading(false);
      return;
    }

    if (attError) {
      alert(attError.message);
      setLoading(false);
      return;
    }

    const map: Record<string, string> = {};

    (attData ?? []).forEach((a) => {
      map[a.student_id] = a.status;
    });

    setStudents(studentData ?? []);
    setAttendance(attData ?? []);
    setStatusMap(map);
    setLoading(false);
  }

  useEffect(() => {
    loadStudents();
  }, [classId, date]);

  function setStudentStatus(studentId: string, status: string) {
    setStatusMap((prev) => ({
      ...prev,
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
      alert(error.message);
      return;
    }

    alert("✅ Đã lưu điểm danh.");
    await loadStudents();
  }

  const stats = {
    present: students.filter(
      (s) => statusMap[s.id] === "present"
    ).length,
    absent: students.filter(
      (s) => statusMap[s.id] === "absent"
    ).length,
    excused: students.filter(
      (s) => statusMap[s.id] === "excused"
    ).length,
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="text-xs font-black uppercase tracking-widest text-blue-600">
          QUẢN LÝ LỚP HỌC
        </div>
        <h1 className="mt-1 text-4xl font-black">📝 Điểm danh</h1>
        <p className="mt-2 text-slate-400">
          Điểm danh học viên theo từng lớp và từng ngày
        </p>
      </section>

      <section className="ui-card p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <div className="mb-2 text-sm font-bold">Cơ sở</div>
            <select
              className="ui-input"
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setClassId("");
              }}
            >
              <option value="">-- Tất cả cơ sở --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div className="mb-2 text-sm font-bold">Lớp</div>
            <select
              className="ui-input"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">-- Chọn lớp --</option>
              {filteredClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div className="mb-2 text-sm font-bold">Ngày học</div>
            <input
              type="date"
              className="ui-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      </section>

      {classId && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="ui-card p-5">
              <div className="text-sm font-bold text-slate-400">
                🟢 CÓ MẶT
              </div>
              <div className="mt-1 text-3xl font-black text-emerald-600">
                {stats.present}
              </div>
            </div>

            <div className="ui-card p-5">
              <div className="text-sm font-bold text-slate-400">
                🔴 VẮNG
              </div>
              <div className="mt-1 text-3xl font-black text-rose-500">
                {stats.absent}
              </div>
            </div>

            <div className="ui-card p-5">
              <div className="text-sm font-bold text-slate-400">
                🟡 CÓ PHÉP
              </div>
              <div className="mt-1 text-3xl font-black text-amber-500">
                {stats.excused}
              </div>
            </div>
          </section>

          <section className="ui-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-black">
                  Danh sách học viên
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {date}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  className="ui-btn ui-btn-blue"
                  onClick={() => markAll("present")}
                >
                  Tất cả có mặt
                </button>

                <button
                  className="ui-btn"
                  onClick={() => markAll("absent")}
                >
                  Tất cả vắng
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-slate-400">
                Đang tải...
              </div>
            ) : students.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                Lớp chưa có học viên.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {students.map((student, index) => {
                  const current =
                    statusMap[student.id] || "present";

                  return (
                    <div
                      key={student.id}
                      className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 font-black">
                          {index + 1}
                        </div>

                        <div className="font-bold">
                          {student.full_name}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className={`ui-btn ${
                            current === "present"
                              ? "ui-btn-blue"
                              : ""
                          }`}
                          onClick={() =>
                            setStudentStatus(
                              student.id,
                              "present"
                            )
                          }
                        >
                          🟢 Có mặt
                        </button>

                        <button
                          className={`ui-btn ${
                            current === "absent"
                              ? "bg-rose-100 text-rose-700"
                              : ""
                          }`}
                          onClick={() =>
                            setStudentStatus(
                              student.id,
                              "absent"
                            )
                          }
                        >
                          🔴 Vắng
                        </button>

                        <button
                          className={`ui-btn ${
                            current === "excused"
                              ? "bg-amber-100 text-amber-700"
                              : ""
                          }`}
                          onClick={() =>
                            setStudentStatus(
                              student.id,
                              "excused"
                            )
                          }
                        >
                          🟡 Có phép
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {students.length > 0 && (
              <div className="flex justify-end border-t border-slate-100 p-6">
                <button
                  className="ui-btn ui-btn-primary"
                  onClick={saveAttendance}
                  disabled={saving}
                >
                  {saving ? "Đang lưu..." : "💾 Lưu điểm danh"}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
