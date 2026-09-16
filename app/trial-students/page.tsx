"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TrialStudent = {
  id: string;
  full_name: string;
  trial_date: string;
  note: string | null;
  status: string;
  class_id: string;
  teacher_id: string;
  classes: { name: string }[] | null;
  teachers: { full_name: string }[] | null;
};

export default function TrialStudentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const loadRequestRef = useRef(0);

  const [rows, setRows] = useState<TrialStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);

    const { data, error } = await supabase.rpc(
      "get_trial_students_admin"
    );

    if (requestId !== loadRequestRef.current) return;

    if (error) {
      console.error("TRIAL ADMIN LOAD ERROR:", error);
      alert("Không tải được danh sách học thử: " + error.message);
      setRows([]);
    } else {
      const rpcRows = (data ?? []) as {
        id: string;
        full_name: string;
        trial_date: string;
        note: string | null;
        status: string;
        class_id: string;
        class_name: string | null;
        teacher_id: string;
        teacher_name: string | null;
      }[];

      setRows(
        rpcRows.map((row) => ({
          id: row.id,
          full_name: row.full_name,
          trial_date: row.trial_date,
          note: row.note,
          status: row.status,
          class_id: row.class_id,
          teacher_id: row.teacher_id,
          classes: row.class_name
            ? [{ name: row.class_name }]
            : null,
          teachers: row.teacher_name
            ? [{ full_name: row.teacher_name }]
            : null,
        }))
      );
    }

    setLoading(false);
  }, [supabase]);

  async function convertTrial(row: TrialStudent) {
    const confirmed = window.confirm(
      `Chuyển "${row.full_name}" thành học viên chính thức của lớp "${row.classes?.[0]?.name ?? "lớp này"}"?`
    );

    if (!confirmed) return;

    setProcessingId(row.id);

    const { error } = await supabase.rpc("convert_trial_student", {
      p_trial_student_id: row.id,
    });

    if (error) {
      console.error("TRIAL CONVERT ERROR:", error);
      alert("Không thể chuyển học viên: " + error.message);
      setProcessingId(null);
      return;
    }

    await loadData();
    setProcessingId(null);

    alert("✅ Đã chuyển thành học viên chính thức và đưa vào đúng lớp.");
  }

  async function deleteTrial(row: TrialStudent) {
    const confirmed = window.confirm(
      `Xóa hồ sơ học thử của "${row.full_name}"?\\n\\nThao tác này chỉ xóa hồ sơ học thử, không ảnh hưởng học viên chính thức.`
    );

    if (!confirmed) return;

    setProcessingId(row.id);

    const { error } = await supabase
      .from("trial_students")
      .delete()
      .eq("id", row.id);

    if (error) {
      console.error("TRIAL DELETE ERROR:", error);
      alert("Không thể xóa học thử: " + error.message);
      setProcessingId(null);
      return;
    }

    await loadData();
    setProcessingId(null);

    alert("🗑️ Đã xóa hồ sơ học thử.");
  }

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = rows.filter((row) =>
    row.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const trialCount = rows.filter((row) => row.status === "trial").length;
  const convertedCount = rows.filter(
    (row) => row.status === "converted"
  ).length;

  return (
    <div className="space-y-6">
      <section>
        <div className="text-xs font-black uppercase tracking-widest text-amber-600">
          Quản lý
        </div>

        <h1 className="mt-1 text-2xl font-black text-slate-900">
          🎟️ Học thử
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Theo dõi các học viên đến học thử nhưng chưa được tạo hồ sơ chính thức.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-3xl font-black">{rows.length}</div>
          <div className="mt-1 text-sm text-slate-500">
            Tổng lượt học thử
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-3xl font-black">{trialCount}</div>
          <div className="mt-1 text-sm text-slate-500">
            Đang học thử
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-3xl font-black">{convertedCount}</div>
          <div className="mt-1 text-sm text-slate-500">
            Đã chuyển chính thức
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="🔎 Tìm tên học viên..."
          className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid grid-cols-[1.5fr_1.2fr_1fr_1.2fr_auto_auto] gap-4 border-b bg-slate-50 px-5 py-4 text-sm font-black text-slate-700">
          <div>Học viên</div>
          <div>Lớp</div>
          <div>Ngày học thử</div>
          <div>Giáo viên</div>
          <div>Trạng thái</div>
          <div>Thao tác</div>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500">
            Đang tải danh sách học thử...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-6 text-slate-500">
            Chưa có dữ liệu học thử.
          </div>
        ) : (
          <div className="divide-y">
            {filteredRows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1.5fr_1.2fr_1fr_1.2fr_auto_auto] gap-4 px-5 py-4"
              >
                <div>
                  <div className="font-bold text-slate-900">
                    {row.full_name}
                  </div>

                  {row.note && (
                    <div className="mt-1 text-sm text-slate-500">
                      {row.note}
                    </div>
                  )}
                </div>

                <div className="text-sm text-slate-700">
                  {row.classes?.[0]?.name ?? "—"}
                </div>

                <div className="text-sm text-slate-700">
                  {row.trial_date}
                </div>

                <div className="text-sm text-slate-700">
                  {row.teachers?.[0]?.full_name ?? "—"}
                </div>

                <div>
                  <span className="whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                    {row.status === "trial"
                      ? "Học thử"
                      : row.status === "converted"
                        ? "Đã chuyển"
                        : "Đã hủy"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.status === "trial" && (
                    <>
                      <button
                        type="button"
                        onClick={() => convertTrial(row)}
                        disabled={processingId === row.id}
                        className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {processingId === row.id
                          ? "Đang xử lý..."
                          : "🟢 Chuyển vào lớp"}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteTrial(row)}
                        disabled={processingId === row.id}
                        className="whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-50"
                      >
                        🗑️ Xóa
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
