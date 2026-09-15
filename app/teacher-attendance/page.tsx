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
  schedule_days: string[] | null;
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

function getScheduleDayKey(value: string) {
  const d = new Date(`${value}T12:00:00`);
  const day = d.getDay();

  if (day === 0) return "CN";
  return String(day + 1);
}

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
  const [confirmedTeacherIds, setConfirmedTeacherIds] = useState<Set<string>>(
    new Set()
  );
  const [hasApprovedSubstitution, setHasApprovedSubstitution] = useState(false);
  const [approvedSubstitutionTeacherIds, setApprovedSubstitutionTeacherIds] =
    useState<Set<string>>(new Set());

  async function loadBase() {
    setLoading(true);

    const [{ data: branchData }, { data: classData }] = await Promise.all([
      supabase
        .from("branches")
        .select("id,name")
        .order("name"),
      supabase
        .from("classes")
        .select("id,name,branch_id,status,schedule_days")
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

    const { data: approvedSubstitutions, error: substitutionError } =
      await supabase
        .from("teacher_substitution_requests")
        .select("standing_teacher_id")
        .eq("class_id", classId)
        .eq("session_date", date)
        .eq("status", "approved");

    if (substitutionError) {
      console.error("APPROVED SUBSTITUTION ERROR:", substitutionError);
    }

    setApprovedSubstitutionTeacherIds(
      new Set(
        (approvedSubstitutions ?? [])
          .map((item) => item.standing_teacher_id)
          .filter(Boolean)
      )
    );

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

    const { data: workSessions, error: workSessionError } = await supabase
      .from("teacher_work_sessions")
      .select("actual_teacher_id")
      .eq("class_id", classId)
      .eq("session_date", date);

    if (workSessionError) {
      console.error("TEACHER WORK SESSION ERROR:", workSessionError);
    }

    setConfirmedTeacherIds(
      new Set(
        (workSessions ?? [])
          .map((item) => item.actual_teacher_id)
          .filter(Boolean)
      )
    );

    setHasApprovedSubstitution(
      (approvedSubstitutions ?? []).length > 0
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
    else {
      setRows([]);
      setApprovedSubstitutionTeacherIds(new Set());
      setConfirmedTeacherIds(new Set());
    }
  }, [classId, date]);

  const filteredClasses = useMemo(() => {
    const scheduleDay = getScheduleDayKey(date);

    return classes.filter((item) => {
      if (item.branch_id !== branchId) return false;

      if (!Array.isArray(item.schedule_days)) return false;

      return item.schedule_days.some(
        (day) =>
          String(day).trim().toUpperCase() === scheduleDay
      );
    });
  }, [classes, branchId, date]);

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

    try {
      const alreadyConfirmed = rows.filter(
        (row) =>
          row.status === "taught" &&
          confirmedTeacherIds.has(row.teacher.id)
      );

      const blockedBySubstitution = rows.filter(
        (row) =>
          row.status === "taught" &&
          approvedSubstitutionTeacherIds.has(row.teacher.id)
      );

      if (blockedBySubstitution.length > 0) {
        alert(
          "⚠️ Lớp này đã có giáo viên dạy thay được Admin duyệt. " +
          "Không thể điểm danh giáo viên đứng lớp là Đã dạy."
        );
        setRows((current) =>
          current.map((row) =>
            approvedSubstitutionTeacherIds.has(row.teacher.id)
              ? { ...row, status: "absent" }
              : row
          )
        );
        return;
      }

      for (const row of rows) {
        if (
          row.status === "taught" &&
          confirmedTeacherIds.has(row.teacher.id)
        ) {
          continue;
        }

        const { error } = await supabase.rpc(
          "sync_teacher_attendance_to_work_session",
          {
            p_teacher_id: row.teacher.id,
            p_class_id: classId,
            p_attendance_date: date,
            p_status: row.status,
          }
        );

        if (error) {
          if (error?.code !== "P0001") {
          console.error(
            "SYNC TEACHER ATTENDANCE ERROR:",
            JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
          );
        }

          alert(
            error?.code === "P0001"
              ? "🔒 Bảng lương tháng này đã chốt, không thể sửa điểm danh."
              : "❌ Không thể lưu điểm danh giáo viên."
          );

          return;
        }
      }

      await loadTeachers();

      if (
        alreadyConfirmed.length > 0 &&
        alreadyConfirmed.length ===
          rows.filter((row) => row.status === "taught").length
      ) {
        alert(
          "⚠️ Buổi này đã điểm danh rồi. Không tạo thêm buổi lương."
        );
      } else if (alreadyConfirmed.length > 0) {
        alert(
          "⚠️ Một số giáo viên đã điểm danh trước đó. " +
          "Hệ thống không tạo trùng buổi lương."
        );
      } else {
        alert(
          "✅ Đã lưu điểm danh giáo viên và đồng bộ vào bảng tính lương."
        );
      }
    } catch (error) {
      console.error("SAVE TEACHER ATTENDANCE ERROR:", error);
      alert("❌ Có lỗi khi lưu điểm danh giáo viên.");
    } finally {
      setSaving(false);
    }
  }

  const taughtCount = hasApprovedSubstitution
    ? 0
    : rows.filter((row) => row.status === "taught").length;

  const substituteCount = hasApprovedSubstitution ? 1 : 0;

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
          <section className="grid gap-4 md:grid-cols-4">
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
                Dạy thay
              </div>
              <div className="mt-1 text-3xl font-black text-amber-600">
                {substituteCount}
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
                        onClick={() => {
                          if (approvedSubstitutionTeacherIds.has(row.teacher.id)) {
                            alert(
                              "⚠️ Lớp này đã có giáo viên dạy thay được Admin duyệt. " +
                              "Giáo viên đứng lớp không thể xác nhận Đã dạy cho buổi này."
                            );
                            return;
                          }
                          setStatus(row.teacher.id, "taught");
                        }}
                        disabled={approvedSubstitutionTeacherIds.has(row.teacher.id)}
                        className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                          approvedSubstitutionTeacherIds.has(row.teacher.id)
                            ? "cursor-not-allowed bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                            : row.status === "taught" && confirmedTeacherIds.has(row.teacher.id)
                              ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                              : row.status === "taught"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "bg-slate-100 text-slate-500 hover:bg-emerald-50"
                        }`}
                      >
                        {approvedSubstitutionTeacherIds.has(row.teacher.id)
                          ? "🔄 Đã có GV dạy thay"
                          : row.status === "taught" && confirmedTeacherIds.has(row.teacher.id)
                            ? "⚠️ Đã điểm danh"
                            : "✅ Đã dạy"}
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
