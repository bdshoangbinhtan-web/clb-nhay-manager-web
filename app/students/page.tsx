 "use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Student = {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  status: string | null;
  created_at: string;
  branch_id: string | null;
};

type Branch = {
  id: string;
  name: string;
};

type ClassStudent = {
  student_id: string;
  class_id: string;
  classes:
    | {
        id: string;
        name: string;
        branch_id: string;
      }
    | {
        id: string;
        name: string;
        branch_id: string;
      }[]
    | null;
};

export default function StudentsPage() {
  const supabase = createClient();

  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classStudents, setClassStudents] = useState<ClassStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const loadData = useCallback(async () => {
    setLoading(true);

    const [studentsRes, branchesRes, classStudentsRes] = await Promise.all([
      supabase
        .from("students")
        .select(
          "id,full_name,status,created_at,branch_id"
        )
        .order("full_name"),
      supabase
        .from("branches")
        .select("id,name")
        .order("name"),
      supabase
        .from("class_students")
        .select(
          "student_id,class_id,classes(id,name,branch_id)"
        ),
    ]);

    if (studentsRes.error) console.error(studentsRes.error);
    if (branchesRes.error) console.error(branchesRes.error);
    if (classStudentsRes.error) console.error(classStudentsRes.error);

    setStudents(studentsRes.data ?? []);
    setBranches(branchesRes.data ?? []);
    setClassStudents(classStudentsRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

  const classMap = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const row of classStudents) {
      const cls = Array.isArray(row.classes)
        ? row.classes[0]
        : row.classes;

      if (!cls) continue;

      const list = map.get(row.student_id) ?? [];
      list.push(cls.name);
      map.set(row.student_id, list);
    }

    return map;
  }, [classStudents]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return students.filter((student) => {
      const matchesSearch =
        !keyword ||
        student.full_name.toLowerCase().includes(keyword) ||
        student.full_name.toLowerCase().includes(keyword);

      const matchesBranch =
        branchFilter === "all" ||
        student.branch_id === branchFilter;

      const matchesStatus =
        statusFilter === "all" ||
        student.status === statusFilter;

      return matchesSearch && matchesBranch && matchesStatus;
    });
  }, [students, search, branchFilter, statusFilter]);

  const activeCount = students.filter(
    (student) => student.status === "active"
  ).length;

  const inactiveCount = students.length - activeCount;

  return (
    <div className="space-y-7">
      {/* HEADER */}
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 text-sm font-bold text-blue-600">
            QUẢN LÝ HỌC VIÊN
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Học viên
          </h1>

          <p className="mt-2 text-sm text-slate-500 sm:text-base">
            Quản lý hồ sơ, lớp học và tình trạng học viên
          </p>
        </div>

        <Link
          href="/students/new"
          className="ui-btn ui-btn-primary flex w-fit items-center gap-2 px-5"
        >
          <span className="text-xl">＋</span>
          Thêm học viên
        </Link>
      </section>

      {/* SUMMARY */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="ui-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
              👥
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-400">
                Tổng học viên
              </div>
              <div className="text-2xl font-black">
                {loading ? "—" : students.length}
              </div>
            </div>
          </div>
        </div>

        <div className="ui-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
              🟢
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-400">
                Đang hoạt động
              </div>
              <div className="text-2xl font-black text-emerald-700">
                {loading ? "—" : activeCount}
              </div>
            </div>
          </div>
        </div>

        <div className="ui-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
              ⚪
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-400">
                Tạm ngưng
              </div>
              <div className="text-2xl font-black text-slate-600">
                {loading ? "—" : inactiveCount}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FILTER */}
      <section className="ui-card p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              🔎
            </span>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, số điện thoại, email..."
              className="ui-input pl-11"
            />
          </div>

          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="ui-input"
          >
            <option value="all">🏢 Tất cả cơ sở</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ui-input"
          >
            <option value="active">🟢 Đang hoạt động</option>
            <option value="inactive">⚪ Tạm ngưng</option>
            <option value="all">Tất cả trạng thái</option>
          </select>
        </div>
      </section>

      {/* LIST */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-black">👥 Danh sách học viên</h2>
            <p className="mt-1 text-sm text-slate-400">
              {filteredStudents.length} học viên đang hiển thị
            </p>
          </div>
        </div>

        {loading ? (
          <div className="ui-card p-12 text-center text-slate-400">
            Đang tải danh sách học viên...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="ui-card p-12 text-center">
            <div className="text-5xl">👥</div>
            <div className="mt-4 text-lg font-black">
              Không tìm thấy học viên
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Thử thay đổi từ khóa hoặc bộ lọc.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map((student) => {
              const classes = classMap.get(student.id) ?? [];
              const active = student.status === "active";

              return (
                <article
                  key={student.id}
                  className="ui-card group overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(35,50,75,.13)]"
                >
                  <div className="flex gap-4">
                    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-100 via-white to-indigo-100 text-3xl shadow-[inset_0_1px_0_white,0_8px_18px_rgba(50,80,130,.10)]">
                      👤
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[17px] font-black text-slate-900">
                        {student.full_name}
                      </h3>

                      <div className="mt-1 truncate text-sm text-slate-500">
                        🏢{" "}
                        {student.branch_id
                          ? branchMap.get(student.branch_id) ||
                            "Chưa xác định"
                          : "Chưa gán cơ sở"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50/80 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Lớp đang học
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {classes.length ? (
                        classes.map((className) => (
                          <span
                            key={className}
                            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-[0_3px_9px_rgba(35,50,75,.06)]"
                          >
                            📚 {className}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">
                          Chưa tham gia lớp
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span
                      className={`ui-pill ${
                        active ? "ui-pill-active" : ""
                      }`}
                    >
                      {active ? "🟢 Đang học" : "⚪ Tạm ngưng"}
                    </span>

                    <span className="text-xs font-medium text-slate-400">
                      Tham gia{" "}
                      {new Date(student.created_at).toLocaleDateString(
                        "vi-VN"
                      )}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Link
                      href={`/students/${student.id}`}
                      className="ui-btn ui-btn-light flex items-center justify-center gap-2 text-sm"
                    >
                      👁 Xem hồ sơ
                    </Link>

                    <Link
                      href={`/students/${student.id}`}
                      className="ui-btn ui-btn-blue flex items-center justify-center gap-2 text-sm"
                    >
                      ✏️ Sửa
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
