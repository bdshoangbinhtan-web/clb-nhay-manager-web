"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Teacher = {
  id: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  start_date: string | null;
  salary_type: string;
  salary_rate: number;
  allowance: number;
  avatar_url: string | null;
  notes: string | null;
  status: string;
  end_date: string | null;
};

const SALARY_TYPES = [
  ["per_session", "🕐 Theo buổi"],
];

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value || 0) + " đ";
}

function date(value: string | null) {
  if (!value) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("vi-VN");
}

function salaryLabel(value: string) {
  return SALARY_TYPES.find(([id]) => id === value)?.[1] ?? value;
}

export default function TeachersPage() {
  const supabase = createClient();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [salaryType, setSalaryType] = useState("per_session");
  const [salaryRate, setSalaryRate] = useState("");
  const [allowance, setAllowance] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [notes, setNotes] = useState("");

  async function loadData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("teachers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setTeachers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setEditingId(null);
    setFullName("");
    setPhone("");
    setBirthDate("");
    setAddress("");
    setStartDate("");
    setSalaryType("per_session");
    setSalaryRate("");
    setAllowance("");
    setAvatarUrl("");
    setNotes("");
  }

  function openAdd() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(t: Teacher) {
    setEditingId(t.id);
    setFullName(t.full_name || "");
    setPhone(t.phone || "");
    setBirthDate(t.birth_date || "");
    setAddress(t.address || "");
    setStartDate(t.start_date || "");
    setSalaryType("per_session");
    setSalaryRate(String(t.salary_rate ?? ""));
    setAllowance(String(t.allowance ?? ""));
    setAvatarUrl(t.avatar_url || "");
    setNotes(t.notes || "");
    setShowForm(true);
  }

  async function saveTeacher(e: React.FormEvent) {
    e.preventDefault();

    if (!fullName.trim()) {
      alert("Hãy nhập họ tên giáo viên.");
      return;
    }

    const rate = Number(salaryRate);

    if (!salaryRate.trim() || !Number.isFinite(rate) || rate < 0) {
      alert("Hãy nhập mức lương / thù lao theo buổi hợp lệ.");
      return;
    }

    setSaving(true);

    const payload = {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      birth_date: birthDate || null,
      address: address.trim() || null,
      start_date: startDate || null,
      salary_type: "per_session",
      salary_rate: rate,
      allowance: 0,
      avatar_url: avatarUrl.trim() || null,
      notes: notes.trim() || null,
    };

    let result;

    if (editingId) {
      result = await supabase
        .from("teachers")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .single();
    } else {
      result = await supabase
        .from("teachers")
        .insert({
          ...payload,
          status: "active",
        })
        .select("*")
        .single();
    }

    setSaving(false);

    if (result.error || !result.data) {
      console.error("TEACHER SAVE ERROR:", result.error);
      alert(
        "❌ Không thể lưu giáo viên.\n\n" +
        (result.error?.message || "Không nhận được dữ liệu sau khi lưu.")
      );
      return;
    }

    const savedTeacher = result.data;

    // Cập nhật card ngay bằng chính dữ liệu DB vừa trả về
    setTeachers((current) => {
      if (editingId) {
        return current.map((teacher) =>
          teacher.id === editingId ? savedTeacher : teacher
        );
      }

      return [savedTeacher, ...current];
    });

    alert(
      (editingId
        ? "✅ Đã cập nhật giáo viên."
        : "✅ Đã thêm giáo viên.") +
        "\n\nMức lương: " +
        Number(savedTeacher.salary_rate ?? 0).toLocaleString("vi-VN") +
        " đ/buổi"
    );

    resetForm();
    setShowForm(false);
  }

  async function toggleStatus(t: Teacher) {
    const next = t.status === "active" ? "inactive" : "active";

    const { error } = await supabase
      .from("teachers")
      .update({
        status: next,
        end_date:
          next === "inactive"
            ? new Date().toISOString().slice(0, 10)
            : null,
      })
      .eq("id", t.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  async function deleteTeacher(id: string) {
    if (!confirm("Bạn có chắc muốn xóa giáo viên này?")) return;

    const { error } = await supabase
      .from("teachers")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return teachers;

    return teachers.filter((t) =>
      [t.full_name, t.phone || "", t.address || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [teachers, search]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-blue-600">
            NHÂN SỰ
          </div>

          <h1 className="mt-1 text-4xl font-black tracking-tight">
            👨‍🏫 Giáo viên
          </h1>

          <p className="mt-2 text-slate-400">
            Quản lý hồ sơ, trạng thái và chế độ thu nhập giáo viên
          </p>
        </div>

        <button className="ui-btn ui-btn-primary" onClick={openAdd}>
          + Thêm giáo viên
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">
            TỔNG GIÁO VIÊN
          </div>
          <div className="mt-2 text-3xl font-black">
            {teachers.length}
          </div>
        </div>

        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">
            ĐANG LÀM
          </div>
          <div className="mt-2 text-3xl font-black text-emerald-600">
            {teachers.filter((t) => t.status === "active").length}
          </div>
        </div>

        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">
            ĐÃ NGHỈ
          </div>
          <div className="mt-2 text-3xl font-black text-slate-400">
            {teachers.filter((t) => t.status !== "active").length}
          </div>
        </div>
      </section>

      {showForm && (
        <section className="ui-card p-6 sm:p-8">
          <div className="mb-6">
            <div className="text-xs font-black uppercase tracking-widest text-blue-600">
              {editingId ? "CHỈNH SỬA" : "THÊM MỚI"}
            </div>

            <h2 className="mt-1 text-2xl font-black">
              {editingId ? "Cập nhật giáo viên" : "Thêm giáo viên"}
            </h2>
          </div>

          <form
            onSubmit={saveTeacher}
            className="grid gap-5 md:grid-cols-2"
          >
            <label>
              <div className="mb-2 text-sm font-bold">Họ và tên *</div>
              <input
                className="ui-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">Số điện thoại</div>
              <input
                className="ui-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">Ngày sinh</div>
              <input
                type="date"
                className="ui-input"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">
                Ngày bắt đầu làm
              </div>
              <input
                type="date"
                className="ui-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>

            <label className="md:col-span-2">
              <div className="mb-2 text-sm font-bold">Địa chỉ</div>
              <input
                className="ui-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">
                Kiểu tính lương
              </div>
              <select
                className="ui-input"
                value="per_session"
                disabled
              >
                <option value="per_session">🕐 Theo buổi</option>
              </select>
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">
                Mức lương / thù lao *
              </div>
              <input
                type="number"
                min="0"
                step="1000"
                className="ui-input"
                value={salaryRate}
                onChange={(e) => setSalaryRate(e.target.value)}
                placeholder="Ví dụ: 250000"
                required
              />
              <div className="mt-1 text-xs font-semibold text-slate-400">
                Tính theo mỗi buổi giáo viên đã dạy
              </div>
            </label>

            <label className="md:col-span-2">
              <div className="mb-2 text-sm font-bold">
                Link ảnh đại diện
              </div>
              <input
                className="ui-input"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className="md:col-span-2">
              <div className="mb-2 text-sm font-bold">Ghi chú</div>
              <textarea
                className="ui-input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <div className="flex justify-end gap-3 md:col-span-2">
              <button
                type="button"
                className="ui-btn"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                Hủy
              </button>

              <button
                type="submit"
                className="ui-btn ui-btn-primary"
                disabled={saving}
              >
                {saving
                  ? "Đang lưu..."
                  : editingId
                  ? "💾 Lưu thay đổi"
                  : "💾 Lưu giáo viên"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="ui-card p-5">
        <input
          className="ui-input"
          placeholder="🔎 Tìm giáo viên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="ui-card p-10 text-center text-slate-400 md:col-span-2 xl:col-span-3">
            Đang tải giáo viên...
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="ui-card p-10 text-center text-slate-400 md:col-span-2 xl:col-span-3">
            Chưa có giáo viên.
          </div>
        ) : (
          filteredTeachers.map((teacher) => (
            <article key={teacher.id} className="ui-card p-6">
              <div className="flex items-start gap-4">
                {teacher.avatar_url ? (
                  <img
                    src={teacher.avatar_url}
                    alt={teacher.full_name}
                    className="h-20 w-20 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 text-3xl">
                    👨‍🏫
                  </div>
                )}

                <div className="min-w-0">
                  <h3 className="text-xl font-black">
                    {teacher.full_name}
                  </h3>

                  <div className="mt-1 text-sm text-slate-400">
                    📞 {teacher.phone || "Chưa có SĐT"}
                  </div>

                  <div className="mt-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        teacher.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {teacher.status === "active"
                        ? "🟢 Đang làm"
                        : "⚪ Đã nghỉ"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Ngày bắt đầu</span>
                  <b>{date(teacher.start_date)}</b>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">Kiểu lương</span>
                  <b>{salaryLabel(teacher.salary_type)}</b>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">Mức lương</span>
                  <b>{money(Number(teacher.salary_rate))}</b>
                </div>


              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="ui-btn"
                  onClick={() => openEdit(teacher)}
                >
                  ✏️ Sửa
                </button>

                <button
                  className="ui-btn"
                  onClick={() => toggleStatus(teacher)}
                >
                  {teacher.status === "active"
                    ? "🟠 Cho nghỉ"
                    : "🟢 Làm lại"}
                </button>

                <button
                  className="ui-btn bg-rose-50 text-rose-600"
                  onClick={() => deleteTeacher(teacher.id)}
                >
                  🗑️ Xóa
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
