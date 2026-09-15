 "use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ClassItem = {
  id: string;
  name: string;
};

type TrialStudent = {
  id: string;
  full_name: string;
  trial_date: string;
  note: string | null;
  status: string;
};

export default function TeacherTrialStudentsPage() {
  const supabase = createClient();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [trialDate, setTrialDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [fullName, setFullName] = useState("");
  const [note, setNote] = useState("");

  const [rows, setRows] = useState<TrialStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadClasses() {
    setLoading(true);

    const { data, error } = await supabase
      .from("classes")
      .select("id,name")
      .eq("status", "active")
      .order("name");

    if (error) {
      console.error(error);
      setClasses([]);
      alert("Không tải được lớp của bạn.");
    } else {
      const list = data ?? [];
      setClasses(list);

      if (list.length > 0) {
        setClassId((current) => current || list[0].id);
      }
    }

    setLoading(false);
  }

  async function loadTrialStudents() {
    if (!classId) {
      setRows([]);
      return;
    }

    setLoadingRows(true);

    const { data, error } = await supabase
      .from("trial_students")
      .select("id,full_name,trial_date,note,status")
      .eq("class_id", classId)
      .eq("trial_date", trialDate)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      alert("Không tải được danh sách học thử.");
    } else {
      setRows(data ?? []);
    }

    setLoadingRows(false);
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadTrialStudents();
  }, [classId, trialDate]);

  async function saveTrialStudent() {
    if (!classId) {
      alert("Hãy chọn lớp.");
      return;
    }

    if (!fullName.trim()) {
      alert("Hãy nhập tên học viên học thử.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("create_trial_student", {
      p_full_name: fullName.trim(),
      p_class_id: classId,
      p_trial_date: trialDate,
      p_note: note.trim() || null,
    });

    setSaving(false);

    if (error) {
      console.error(error);
      alert("Không thể lưu học thử: " + error.message);
      return;
    }

    setFullName("");
    setNote("");

    await loadTrialStudents();

    alert("🎟️ Đã lưu học viên học thử.");
  }

  const selectedClass = classes.find((item) => item.id === classId);

  return (
    <div className="space-y-6">
      <section>
        <div className="text-xs font-black uppercase tracking-widest text-amber-600">
          Giáo viên
        </div>

        <h1 className="mt-1 text-2xl font-black text-slate-900">
          🎟️ Học thử
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Theo dõi học viên đến học thử nhưng chưa tạo hồ sơ chính thức.
        </p>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Lớp
            </label>

            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              disabled={loading || classes.length === 0}
              className="w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
            >
              {loading ? (
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
              Ngày học thử
            </label>

            <input
              type="date"
              value={trialDate}
              onChange={(event) => setTrialDate(event.target.value)}
              className="w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Tên học viên học thử *"
            className="rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
          />

          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ghi chú (không bắt buộc)"
            className="rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
          />

          <button
            type="button"
            onClick={saveTrialStudent}
            disabled={saving || !classId}
            className="rounded-xl bg-amber-600 px-6 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "➕ Lưu học thử"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="font-black text-slate-900">
            Danh sách học thử
          </div>

          <div className="mt-1 text-sm text-slate-500">
            {selectedClass?.name ?? "Chưa chọn lớp"} · {trialDate}
          </div>
        </div>

        {loadingRows ? (
          <div className="p-6 text-slate-500">
            Đang tải danh sách...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">
            Chưa có học viên học thử trong ngày này.
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-800">
                    {index + 1}
                  </div>

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
                </div>

                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  {row.status === "trial" ? "Học thử" : row.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
