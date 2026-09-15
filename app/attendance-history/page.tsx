"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch = { id: string; name: string };
type ClassItem = { id: string; name: string; branch_id: string };
type Student = { id: string; full_name: string };

type AttendanceRow = {
  id: string;
  student_id: string;
  class_id: string;
  attendance_date: string;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  present: "Có mặt",
  absent: "Vắng",
  excused: "Có phép",
};

const STATUS_STYLE: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-700",
  absent: "bg-red-50 text-red-700",
  excused: "bg-amber-50 text-amber-700",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function AttendanceHistoryPage() {
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);

  const [branchId, setBranchId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(today());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadBase() {
    setLoading(true);
    setError("");

    const [
      { data: branchData, error: branchError },
      { data: classData, error: classError },
      { data: studentData, error: studentError },
    ] = await Promise.all([
      supabase.from("branches").select("id,name").order("name"),
      supabase
        .from("classes")
        .select("id,name,branch_id")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("students")
        .select("id,full_name")
        .eq("status", "active")
        .order("full_name"),
    ]);

    if (branchError || classError || studentError) {
      setError(
        branchError?.message ||
          classError?.message ||
          studentError?.message ||
          "Không tải được dữ liệu."
      );
      setLoading(false);
      return;
    }

    setBranches(branchData ?? []);
    setClasses(classData ?? []);
    setStudents(studentData ?? []);
    setLoading(false);
  }

  async function loadHistory() {
    setLoading(true);
    setError("");

    let query = supabase
      .from("attendance")
      .select("id,student_id,class_id,attendance_date,status")
      .order("attendance_date", { ascending: false });

    if (fromDate) query = query.gte("attendance_date", fromDate);
    if (toDate) query = query.lte("attendance_date", toDate);
    if (classId) query = query.eq("class_id", classId);
    if (studentId) query = query.eq("student_id", studentId);
    if (status) query = query.eq("status", status);

    const { data, error: historyError } = await query;

    if (historyError) {
      setError(historyError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    loadHistory();
  }, [fromDate, toDate, classId, studentId, status]);

  const filteredClasses = useMemo(
    () =>
      classes.filter((item) => !branchId || item.branch_id === branchId),
    [classes, branchId]
  );

  const visibleRows = useMemo(() => {
    if (!branchId) return rows;

    const allowedClassIds = new Set(
      filteredClasses.map((item) => item.id)
    );

    return rows.filter((row) => allowedClassIds.has(row.class_id));
  }, [rows, branchId, filteredClasses]);

  const classMap = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes]
  );

  const studentMap = useMemo(
    () => new Map(students.map((item) => [item.id, item.full_name])),
    [students]
  );

  const stats = useMemo(() => {
    return {
      total: visibleRows.length,
      present: visibleRows.filter((x) => x.status === "present").length,
      absent: visibleRows.filter((x) => x.status === "absent").length,
      excused: visibleRows.filter((x) => x.status === "excused").length,
    };
  }, [visibleRows]);

  function resetFilters() {
    setBranchId("");
    setClassId("");
    setStudentId("");
    setStatus("");
    setFromDate(monthStart());
    setToDate(today());
  }

  if (loading && !rows.length) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl font-black">📋 Lịch sử điểm danh</h1>
        <div className="ui-card p-6 text-slate-500">Đang tải dữ liệu...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="text-xs font-black uppercase tracking-widest text-blue-600">
          QUẢN LÝ LỚP HỌC
        </div>
        <h1 className="mt-1 text-4xl font-black">📋 Lịch sử điểm danh</h1>
        <p className="mt-2 text-slate-400">
          Xem lại toàn bộ lịch sử học viên có mặt, vắng và có phép.
        </p>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          ❌ {error}
        </div>
      )}

      <section className="ui-card p-6">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <label>
            <div className="mb-2 text-sm font-bold">Từ ngày</div>
            <input
              type="date"
              className="ui-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>

          <label>
            <div className="mb-2 text-sm font-bold">Đến ngày</div>
            <input
              type="date"
              className="ui-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>

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
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
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
              <option value="">-- Tất cả lớp --</option>
              {filteredClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div className="mb-2 text-sm font-bold">Học viên</div>
            <select
              className="ui-input"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">-- Tất cả học viên --</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div className="mb-2 text-sm font-bold">Trạng thái</div>
            <select
              className="ui-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">-- Tất cả --</option>
              <option value="present">Có mặt</option>
              <option value="absent">Vắng</option>
              <option value="excused">Có phép</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold hover:bg-slate-50"
            >
              ↻ Đặt lại bộ lọc
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="ui-card p-5">
          <div className="text-sm font-semibold text-slate-400">Tổng lượt</div>
          <div className="mt-1 text-3xl font-black">{stats.total}</div>
        </div>

        <div className="ui-card p-5">
          <div className="text-sm font-semibold text-slate-400">Có mặt</div>
          <div className="mt-1 text-3xl font-black text-emerald-600">
            {stats.present}
          </div>
        </div>

        <div className="ui-card p-5">
          <div className="text-sm font-semibold text-slate-400">Vắng</div>
          <div className="mt-1 text-3xl font-black text-red-600">
            {stats.absent}
          </div>
        </div>

        <div className="ui-card p-5">
          <div className="text-sm font-semibold text-slate-400">Có phép</div>
          <div className="mt-1 text-3xl font-black text-amber-600">
            {stats.excused}
          </div>
        </div>
      </section>

      <section className="ui-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-lg font-black">Danh sách điểm danh</h2>
            <p className="text-sm text-slate-400">
              {visibleRows.length} lượt điểm danh
            </p>
          </div>
          {loading && (
            <span className="text-sm font-semibold text-slate-400">
              Đang cập nhật...
            </span>
          )}
        </div>

        {!visibleRows.length ? (
          <div className="p-10 text-center text-slate-400">
            Không có dữ liệu điểm danh trong điều kiện đang chọn.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Ngày</th>
                  <th className="px-5 py-4">Lớp</th>
                  <th className="px-5 py-4">Học viên</th>
                  <th className="px-5 py-4">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-semibold">
                      {new Date(row.attendance_date + "T00:00:00").toLocaleDateString(
                        "vi-VN"
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {classMap.get(row.class_id) ?? "—"}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {studentMap.get(row.student_id) ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                          STATUS_STYLE[row.status] ??
                          "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
