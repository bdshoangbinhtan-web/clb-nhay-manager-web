"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch = { id: string; name: string };
type SalaryClass = {
  id: string;
  branch_id: string;
  name: string;
  status: string;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
  teacher_salary_per_session: number | null;
};

type BaseClass = Omit<SalaryClass, "teacher_salary_per_session">;

const DAY_LABELS: Record<string, string> = {
  "0": "CN",
  "2": "T2",
  "3": "T3",
  "4": "T4",
  "5": "T5",
  "6": "T6",
  "7": "T7",
  CN: "CN",
};

function scheduleDays(days: string[] | null) {
  if (!days?.length) return "Chưa có lịch";
  return days.map((day) => DAY_LABELS[day] ?? day).join(" • ");
}

function scheduleTime(start: string | null, end: string | null) {
  if (!start || !end) return "Chưa có giờ";
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

export default function ClassSalaryPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<SalaryClass[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [schemaReady, setSchemaReady] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    const [branchResult, classResult] = await Promise.all([
      supabase.from("branches").select("id,name").order("name"),
      supabase
        .from("classes")
        .select(
          "id,branch_id,name,status,schedule_days,schedule_start,schedule_end"
        )
        .order("name"),
    ]);

    if (branchResult.error || classResult.error) {
      const message = classResult.error?.message ?? branchResult.error?.message;
      setError(message ?? "Không thể tải danh sách lớp.");
      setLoading(false);
      return;
    }

    const baseClasses = (classResult.data ?? []) as BaseClass[];
    const salaryResult = await supabase
      .from("classes")
      .select("id,teacher_salary_per_session");
    const salaryMap = new Map(
      (salaryResult.data ?? []).map((item) => [
        item.id,
        item.teacher_salary_per_session as number | null,
      ])
    );
    const nextClasses: SalaryClass[] = baseClasses.map((item) => ({
      ...item,
      teacher_salary_per_session: salaryMap.get(item.id) ?? null,
    }));

    setSchemaReady(!salaryResult.error);
    setBranches(branchResult.data ?? []);
    setClasses(nextClasses);
    setEdits(
      Object.fromEntries(
        nextClasses.map((item) => [
          item.id,
          item.teacher_salary_per_session == null
            ? ""
            : String(item.teacher_salary_per_session),
        ])
      )
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );
  const missingCount = classes.filter(
    (item) => item.teacher_salary_per_session == null
  ).length;

  async function saveSalary(item: SalaryClass) {
    if (!schemaReady) {
      alert(
        "Chưa thể lưu vì migration lương theo lớp chưa được áp dụng vào database."
      );
      return;
    }

    const rawValue = edits[item.id]?.trim() ?? "";
    const salary = Number(rawValue);

    if (!rawValue || !Number.isFinite(salary) || salary <= 0) {
      alert("Lương/buổi phải là số lớn hơn 0.");
      return;
    }

    setSavingId(item.id);
    const { error: saveError } = await supabase.rpc(
      "update_class_teacher_salary",
      { p_class_id: item.id, p_salary: salary }
    );
    setSavingId(null);

    if (saveError) {
      alert(`Không thể lưu lương lớp.\n\n${saveError.message}`);
      return;
    }

    setClasses((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, teacher_salary_per_session: salary }
          : row
      )
    );
  }

  if (loading) {
    return (
      <section className="rounded-3xl bg-white p-8 text-slate-500 shadow-sm">
        Đang tải lương theo lớp...
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-700">
        {error}
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="text-xl font-black">Lương giáo viên theo lớp</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mỗi lớp có một mức lương cho một giáo viên trong một buổi dạy.
          </p>
        </div>
        <div
          className={`rounded-2xl px-4 py-2 text-sm font-bold ${
            missingCount
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {missingCount
            ? `⚠️ ${missingCount} lớp chưa có mức lương`
            : "✓ Tất cả lớp đã có mức lương"}
        </div>
      </div>

      {!schemaReady && (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
          ⚠️ Danh sách lớp đã được lấy sẵn. Cần áp dụng migration trước khi nhập
          và lưu lương.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">Cơ sở</th>
              <th className="px-5 py-4">Lớp</th>
              <th className="px-5 py-4">Lịch học</th>
              <th className="px-5 py-4">Giờ học</th>
              <th className="px-5 py-4">Trạng thái</th>
              <th className="px-5 py-4">Lương / buổi</th>
              <th className="px-5 py-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {classes.map((item) => {
              const savedValue =
                item.teacher_salary_per_session == null
                  ? ""
                  : String(item.teacher_salary_per_session);
              const changed = (edits[item.id] ?? "") !== savedValue;

              return (
                <tr key={item.id}>
                  <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-700">
                    {branchMap.get(item.branch_id) ?? "Không xác định"}
                  </td>
                  <td className="min-w-48 px-5 py-4 font-black text-slate-900">
                    {item.name}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                    {scheduleDays(item.schedule_days)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                    {scheduleTime(item.schedule_start, item.schedule_end)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        item.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.status === "active" ? "Đang hoạt động" : "Tạm dừng"}
                    </span>
                  </td>
                  <td className="min-w-56 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        step="1000"
                        inputMode="numeric"
                        value={edits[item.id] ?? ""}
                        onChange={(event) =>
                          setEdits((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Ví dụ: 220000"
                        aria-label={`Lương mỗi buổi của lớp ${item.name}`}
                        className="w-40 rounded-xl border border-slate-200 px-3 py-2 font-bold outline-none focus:border-blue-400"
                      />
                      <span className="font-bold text-slate-400">đ</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => saveSalary(item)}
                      disabled={!schemaReady || !changed || savingId === item.id}
                      className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {savingId === item.id ? "Đang lưu..." : "Lưu"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!classes.length && (
        <div className="p-10 text-center text-slate-400">
          Chưa có lớp trong hệ thống.
        </div>
      )}
    </section>
  );
}
