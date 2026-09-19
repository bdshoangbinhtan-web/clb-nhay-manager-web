"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamMonthStart, vietnamToday } from "@/lib/vietnam-date";

type Branch = { id: string; name: string };
type ClassItem = { id: string; name: string; branch_id: string };
type Student = { id: string; student_code: string; full_name: string };

type AttendanceRow = {
  id: string;
  student_id: string;
  class_id: string;
  attendance_date: string;
  status: string;
  recorded_at: string | null;
  class_session_id: string | null;
};

const viCollator = new Intl.Collator("vi-VN");

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
  return vietnamToday();
}

function monthStart() {
  return vietnamMonthStart();
}

export default function AttendanceHistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const historyLoadRequestRef = useRef(0);

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

  const loadBase = useCallback(async () => {
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
        .select("id,student_code,full_name")
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
      return;
    }

    setBranches(branchData ?? []);
    setClasses(classData ?? []);
    setStudents(studentData ?? []);
  }, [supabase]);

  const loadHistory = useCallback(async () => {
    const requestId = ++historyLoadRequestRef.current;
    setLoading(true);
    setError("");

    let query = supabase
      .from("attendance")
      .select(
        "id,student_id,class_id,attendance_date,status,recorded_at,class_session_id"
      )
      .order("attendance_date", { ascending: false });

    if (fromDate) query = query.gte("attendance_date", fromDate);
    if (toDate) query = query.lte("attendance_date", toDate);
    if (classId) query = query.eq("class_id", classId);
    if (studentId) query = query.eq("student_id", studentId);
    if (status) query = query.eq("status", status);

    const { data, error: historyError } = await query;

    if (requestId !== historyLoadRequestRef.current) return;

    if (historyError) {
      setError(historyError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(data ?? []);
    setLoading(false);
  }, [classId, fromDate, status, studentId, supabase, toDate]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filteredClasses = useMemo(
    () =>
      classes.filter((item) => !branchId || item.branch_id === branchId),
    [classes, branchId]
  );

  const classMap = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes]
  );

  const studentDetailsMap = useMemo(
    () => new Map(students.map((item) => [item.id, item])),
    [students]
  );

  const studentMap = useMemo(
    () =>
      new Map(
        students.map((item) => [
          item.id,
          `${item.full_name} · ${item.student_code}`,
        ])
      ),
    [students]
  );

  const visibleRows = useMemo(() => {
    const allowedClassIds = branchId
      ? new Set(filteredClasses.map((item) => item.id))
      : null;
    const filteredRows = allowedClassIds
      ? rows.filter((row) => allowedClassIds.has(row.class_id))
      : rows;
    const groups = new Map<string, AttendanceRow[]>();

    for (const row of filteredRows) {
      const groupKey = row.class_session_id
        ? `session:${row.class_session_id}`
        : `legacy:${row.attendance_date}|${row.class_id}`;
      const groupRows = groups.get(groupKey);

      if (groupRows) {
        groupRows.push(row);
      } else {
        groups.set(groupKey, [row]);
      }
    }

    const sortedGroups = Array.from(groups, ([key, groupRows]) => {
      const attendanceDate = groupRows.reduce(
        (latest, row) =>
          row.attendance_date > latest ? row.attendance_date : latest,
        ""
      );
      const classId = groupRows.reduce(
        (smallest, row) =>
          !smallest || row.class_id < smallest ? row.class_id : smallest,
        ""
      );
      const recordedTimes = groupRows
        .map((row) =>
          row.recorded_at ? Date.parse(row.recorded_at) : Number.NaN
        )
        .filter(Number.isFinite);
      const groupRecordedAt = recordedTimes.length
        ? Math.min(...recordedTimes)
        : null;

      return {
        key,
        rows: groupRows,
        attendanceDate,
        classId,
        className: classMap.get(classId) ?? "",
        groupRecordedAt,
      };
    });

    sortedGroups.sort((a, b) => {
      const dateComparison = b.attendanceDate.localeCompare(a.attendanceDate);
      if (dateComparison !== 0) return dateComparison;

      if (a.groupRecordedAt !== b.groupRecordedAt) {
        if (a.groupRecordedAt === null) return 1;
        if (b.groupRecordedAt === null) return -1;
        return b.groupRecordedAt - a.groupRecordedAt;
      }

      const classNameComparison = viCollator.compare(a.className, b.className);
      if (classNameComparison !== 0) return classNameComparison;

      const classIdComparison = a.classId.localeCompare(b.classId);
      if (classIdComparison !== 0) return classIdComparison;

      return a.key.localeCompare(b.key);
    });

    return sortedGroups.flatMap((group) =>
      group.rows.sort((a, b) => {
        const studentA = studentDetailsMap.get(a.student_id);
        const studentB = studentDetailsMap.get(b.student_id);
        const nameComparison = viCollator.compare(
          studentA?.full_name ?? "",
          studentB?.full_name ?? ""
        );
        if (nameComparison !== 0) return nameComparison;

        const codeComparison = viCollator.compare(
          studentA?.student_code ?? "",
          studentB?.student_code ?? ""
        );
        if (codeComparison !== 0) return codeComparison;

        const studentIdComparison = a.student_id.localeCompare(b.student_id);
        if (studentIdComparison !== 0) return studentIdComparison;

        return a.id.localeCompare(b.id);
      })
    );
  }, [branchId, classMap, filteredClasses, rows, studentDetailsMap]);

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
        <nav className="grid w-full grid-cols-2 gap-2 sm:w-fit" aria-label="Điểm danh">
          <Link
            href="/attendance"
            className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-5 py-3 text-center text-sm font-black text-slate-600 shadow-[0_4px_0_rgba(148,163,184,0.20),0_8px_16px_rgba(15,23,42,0.05)] transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-[0_6px_0_rgba(148,163,184,0.26),0_11px_20px_rgba(15,23,42,0.08)] active:translate-y-[2px] active:shadow-[0_2px_0_rgba(148,163,184,0.18),0_4px_8px_rgba(15,23,42,0.05)]"
          >
            Điểm danh
          </Link>
          <Link
            href="/attendance-history"
            aria-current="page"
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-900 shadow-[0_7px_0_rgba(148,163,184,0.34),0_12px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-[0_2px_0_rgba(148,163,184,0.22),0_5px_10px_rgba(15,23,42,0.06)]"
          >
            Lịch sử
          </Link>
        </nav>
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

      <nav className="grid w-full grid-cols-2 gap-2 sm:w-fit" aria-label="Điểm danh">
        <Link
          href="/attendance"
          className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-5 py-3 text-center text-sm font-black text-slate-600 shadow-[0_4px_0_rgba(148,163,184,0.20),0_8px_16px_rgba(15,23,42,0.05)] transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-[0_6px_0_rgba(148,163,184,0.26),0_11px_20px_rgba(15,23,42,0.08)] active:translate-y-[2px] active:shadow-[0_2px_0_rgba(148,163,184,0.18),0_4px_8px_rgba(15,23,42,0.05)]"
        >
          Điểm danh
        </Link>
        <Link
          href="/attendance-history"
          aria-current="page"
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-900 shadow-[0_7px_0_rgba(148,163,184,0.34),0_12px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-[0_2px_0_rgba(148,163,184,0.22),0_5px_10px_rgba(15,23,42,0.06)]"
        >
          Lịch sử
        </Link>
      </nav>

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
                  {student.full_name} · {student.student_code}
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
