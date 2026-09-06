/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  id: string;
  name: string;
};

type ClassItem = {
  id: string;
  name: string;
  branch_id: string;
  status: string;
};

type Teacher = {
  id: string;
  full_name: string;
  salary_rate: number | null;
  status: string;
};

type Row = {
  teacher: Teacher;
  status: "taught" | "absent";
};

export default function TeacherAttendancePage() {
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

  const [branchId, setBranchId] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [loading, setLoading] = useState(true);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadBase() {
    setLoading(true);

    const [{ data: branchData }, { data: classData }] = await Promise.all([
      supabase
        .from("branches")
        .select("id,name")
        .order("name"),
      supabase
        .from("classes")
        .select("id,name,branch_id,status")
        .eq("status", "active")
        .order("name"),
    ]);

    setBranches(branchData ?? []);
    setClasses(classData ?? []);

    if (!branchId && branchData?.length) {
      setBranchId(branchData[0].id);
    }

    setLoading(false);
  }

  async function loadTeachers() {
    if (!classId || !date) {
      setRows([]);
      return;
    }

    setLoadingTeachers(true);

    const { data: teacherLinks, error: teacherError } = await supabase
      .from("class_teachers")
      .select(`
        teacher_id,
        teachers (
          id,
          full_name,
          salary_rate,
          status
        )
      `)
      .eq("class_id", classId);

    if (teacherError) {
      console.error(teacherError);
      alert("Không tải được giáo viên của lớp.");
      setRows([]);
      setLoadingTeachers(false);
      return;
    }

    const teachers = (teacherLinks ?? [])
      .map((item: any) => item.teachers)
      .filter((teacher: Teacher | null) => teacher && teacher.status === "active")
      .sort((a: Teacher, b: Teacher) =>
        a.full_name.localeCompare(b.full_name, "vi")
      );

    const { data: attendance, error: attendanceError } = await supabase
      .from("teacher_attendance")
      .select("teacher_id,status")
      .eq("class_id", classId)
      .eq("attendance_date", date);

    if (attendanceError) {
      console.error("TEACHER ATTENDANCE ERROR:", attendanceError);
      alert(
        "❌ Lỗi điểm danh giáo viên\n\n" +
        "Code: " + (attendanceError.code || "") + "\n" +
        "Message: " + (attendanceError.message || "") + "\n" +
        "Details: " + (attendanceError.details || "") + "\n" +
        "Hint: " + (attendanceError.hint || "")
      );
    }

    const attendanceMap = new Map(
      (attendance ?? []).map((item) => [item.teacher_id, item.status])
    );

    setRows(
      teachers.map((teacher: Teacher) => ({
        teacher,
        status: attendanceMap.get(teacher.id) === "absent"
          ? "absent"
          : "taught",
      }))
    );

    setLoadingTeachers(false);
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (classId) loadTeachers();
    else setRows([]);
  }, [classId, date]);

  const filteredClasses = useMemo(
    () => classes.filter((item) => item.branch_id === branchId),
    [classes, branchId]
  );

  useEffect(() => {
    if (classId && !filteredClasses.some((item) => item.id === classId)) {
      setClassId("");
    }
  }, [branchId, filteredClasses, classId]);

  function setStatus(teacherId: string, status: "taught" | "absent") {
    setRows((current) =>
      current.map((row) =>
        row.teacher.id === teacherId ? { ...row, status } : row
      )
    );
  }

  function markAll(status: "taught" | "absent") {
    setRows((current) => current.map((row) => ({ ...row, status })));
  }

  async function save() {
    if (!classId || !date || rows.length === 0) {
      alert("Chưa có giáo viên để lưu.");
      return;
    }

    setSaving(true);

    const payload = rows.map((row) => ({
      teacher_id: row.teacher.id,
      class_id: classId,
      attendance_date: date,
      status: row.status,
    }));

    const { error } = await supabase
      .from("teacher_attendance")
      .upsert(payload, {
        onConflict: "teacher_id,class_id,attendance_date",
      });

    setSaving(false);

    if (error) {
      console.error(error);
      alert("❌ Lưu điểm danh thất bại.");
      return;
    }

    alert("✅ Đã lưu điểm danh giáo viên.");
  }

  const taughtCount = rows.filter((row) => row.status === "taught").length;
  const absentCount = rows.filter((row) => row.status === "absent").length;

  if (loading) {
    return (
      <main className="p-6">
        <div className="rounded-3xl bg-white p-8 text-slate-500 shadow-sm">
          Đang tải...
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <div className="text-sm font-bold text-slate-400">GIÁO VIÊN</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight">
          📋 Điểm danh giáo viên
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Mỗi buổi dạy được tính vào lương theo mức lương/buổi.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-400">Ngày dạy</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-slate-500"
          />
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-400">Cơ sở</div>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-400">Lớp</div>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none"
          >
            <option value="">-- Chọn lớp --</option>
            {filteredClasses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {classId && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-400">
                Giáo viên
              </div>
              <div className="mt-1 text-3xl font-black">{rows.length}</div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-400">
                Đã dạy
              </div>
              <div className="mt-1 text-3xl font-black text-emerald-600">
                {taughtCount}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-400">
                Nghỉ
              </div>
              <div className="mt-1 text-3xl font-black text-rose-500">
                {absentCount}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-black">
                  Danh sách giáo viên
                </h2>
                <p className="text-sm text-slate-400">
                  {date.split("-").reverse().join("/")}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => markAll("taught")}
                  className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  ✅ Tất cả đã dạy
                </button>

                <button
                  onClick={() => markAll("absent")}
                  className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100"
                >
                  ❌ Tất cả nghỉ
                </button>
              </div>
            </div>

            {loadingTeachers ? (
              <div className="p-8 text-center text-slate-400">
                Đang tải giáo viên...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                Lớp này chưa có giáo viên.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <div
                    key={row.teacher.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-5"
                  >
                    <div>
                      <div className="font-black">{row.teacher.full_name}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {Number(row.teacher.salary_rate || 0).toLocaleString(
                          "vi-VN"
                        )}{" "}
                        đ / buổi
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setStatus(row.teacher.id, "taught")}
                        className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                          row.status === "taught"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-500 hover:bg-emerald-50"
                        }`}
                      >
                        ✅ Đã dạy
                      </button>

                      <button
                        onClick={() => setStatus(row.teacher.id, "absent")}
                        className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                          row.status === "absent"
                            ? "bg-rose-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-500 hover:bg-rose-50"
                        }`}
                      >
                        ❌ Nghỉ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {rows.length > 0 && (
              <div className="flex justify-end border-t border-slate-100 p-5">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-7 py-3 font-black text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Đang lưu..." : "💾 Lưu điểm danh"}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
