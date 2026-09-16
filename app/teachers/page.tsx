"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamToday } from "@/lib/vietnam-date";

type Teacher = {
  id: string;
  profile_id: string | null;
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
  account_active?: boolean;
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
  const supabase = useMemo(() => createClient(), []);
  const loadRequestRef = useRef(0);

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
  const [salaryRate, setSalaryRate] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [notes, setNotes] = useState("");

  const [accountTeacher, setAccountTeacher] = useState<Teacher | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountActionBusy, setAccountActionBusy] = useState<string | null>(null);
  const [accountPasswordNew, setAccountPasswordNew] = useState("");

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);

    const { data, error } = await supabase
      .from("teachers")
      .select("*")
      .order("created_at", { ascending: false });

    if (requestId !== loadRequestRef.current) return;

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const teacherRows = data ?? [];
    const profileIds = teacherRows
      .map((teacher) => teacher.profile_id)
      .filter((id): id is string => Boolean(id));

    let accountActiveByProfile = new Map<string, boolean>();
    if (profileIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id,is_active")
        .in("id", profileIds);

      if (requestId !== loadRequestRef.current) return;

      if (profileError) {
        console.error("LOAD TEACHER ACCOUNT STATUS ERROR:", profileError);
      } else {
        accountActiveByProfile = new Map(
          (profileRows ?? []).map((profile) => [profile.id, profile.is_active === true])
        );
      }
    }

    setTeachers(
      teacherRows.map((teacher) => ({
        ...teacher,
        account_active: teacher.profile_id
          ? accountActiveByProfile.get(teacher.profile_id) ?? true
          : undefined,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function resetForm() {
    setEditingId(null);
    setFullName("");
    setPhone("");
    setBirthDate("");
    setAddress("");
    setStartDate("");
    setSalaryRate("");
    setAvatarUrl("");
    setNotes("");
  }

  function openAdd() {
    resetForm();
    setShowForm(true);
    requestAnimationFrame(() => {
      document.getElementById("teacher-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function openEdit(t: Teacher) {
    setEditingId(t.id);
    setFullName(t.full_name || "");
    setPhone(t.phone || "");
    setBirthDate(t.birth_date || "");
    setAddress(t.address || "");
    setStartDate(t.start_date || "");
    setSalaryRate(String(t.salary_rate ?? ""));
    setAvatarUrl(t.avatar_url || "");
    setNotes(t.notes || "");
    setShowForm(true);
    requestAnimationFrame(() => {
      document.getElementById("teacher-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
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

  async function createTeacherAccount() {
    if (!accountTeacher) return;

    if (!accountEmail.trim() || !accountPassword) {
      alert("Hãy nhập email và mật khẩu.");
      return;
    }

    if (accountPassword.length < 6) {
      alert("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    setAccountSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("❌ Phiên đăng nhập Admin đã hết. Vui lòng đăng nhập lại.");
        return;
      }

      const response = await fetch("/api/admin/teachers/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          teacherId: accountTeacher.id,
          email: accountEmail.trim().toLowerCase(),
          password: accountPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert("❌ " + (result.error || "Không thể tạo tài khoản."));
        return;
      }

      alert(
        "✅ Đã tạo tài khoản cho " +
          accountTeacher.full_name +
          "\n\nEmail: " +
          accountEmail.trim().toLowerCase()
      );

      setAccountTeacher(null);
      setAccountEmail("");
      setAccountPassword("");

      await loadData();
    } catch (error) {
      console.error("CREATE TEACHER ACCOUNT ERROR:", error);
      alert("❌ Không kết nối được máy chủ.");
    } finally {
      setAccountSaving(false);
    }
  }

  async function accountActionWithPassword(t: Teacher, password: string) {
    if (!t.profile_id) return;
    setAccountActionBusy(`reset_password:${t.id}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("❌ Phiên đăng nhập Admin đã hết. Vui lòng đăng nhập lại.");
        return;
      }

      const response = await fetch("/api/admin/teachers/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ teacherId: t.id, action: "reset_password", password }),
      });
      const result = await response.json();
      if (!response.ok) {
        alert("❌ " + (result.error || "Không thể đổi mật khẩu."));
        return;
      }
      alert(`✅ Đã đổi mật khẩu cho ${t.full_name}.`);
      setAccountPasswordNew("");
      await loadData();
    } catch (error) {
      console.error("RESET TEACHER PASSWORD ERROR:", error);
      alert("❌ Không kết nối được máy chủ.");
    } finally {
      setAccountActionBusy(null);
    }
  }

  async function accountAction(t: Teacher, action: "reset_password" | "lock" | "unlock" | "delete") {
    if (!t.profile_id) return;

    if (action === "delete") {
      const ok = confirm(
        `XÓA TÀI KHOẢN ĐĂNG NHẬP của ${t.full_name}?\n\n` +
          `Chỉ xóa tài khoản đăng nhập. Hồ sơ giáo viên, lớp, điểm danh và lịch sử lương vẫn được giữ.`
      );
      if (!ok) return;
    }

    if (action === "reset_password") {
      if (accountPasswordNew.length < 6) {
        alert("Mật khẩu mới phải có ít nhất 6 ký tự.");
        return;
      }
    }

    setAccountActionBusy(`${action}:${t.id}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("❌ Phiên đăng nhập Admin đã hết. Vui lòng đăng nhập lại.");
        return;
      }

      const response = await fetch("/api/admin/teachers/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          teacherId: t.id,
          action,
          ...(action === "reset_password" ? { password: accountPasswordNew } : {}),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        alert("❌ " + (result.error || "Không thể thao tác tài khoản."));
        return;
      }

      if (action === "delete") {
        alert(`✅ Đã xóa tài khoản đăng nhập của ${t.full_name}.\n\nHồ sơ giáo viên vẫn được giữ.`);
      } else if (action === "reset_password") {
        alert(`✅ Đã đổi mật khẩu cho ${t.full_name}.`);
        setAccountPasswordNew("");
      } else if (action === "lock") {
        alert(`🔒 Đã khóa tài khoản ${t.full_name}.`);
      } else {
        alert(`🔓 Đã mở khóa tài khoản ${t.full_name}.`);
      }

      await loadData();
    } catch (error) {
      console.error("TEACHER ACCOUNT ACTION ERROR:", error);
      alert("❌ Không kết nối được máy chủ.");
    } finally {
      setAccountActionBusy(null);
    }
  }

  async function toggleStatus(t: Teacher) {
    const next = t.status === "active" ? "inactive" : "active";

    const { error } = await supabase
      .from("teachers")
      .update({
        status: next,
        end_date:
          next === "inactive"
            ? vietnamToday()
            : null,
      })
      .eq("id", t.id);

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
        <section
          id="teacher-editor"
          className="ui-card p-6 sm:p-8"
        >
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

      {accountTeacher && (
        <section
          id="teacher-account-editor"
          className="ui-card border-2 border-blue-100 p-6 sm:p-8"
        >
          <div className="mb-5">
            <div className="text-xs font-black uppercase tracking-widest text-blue-600">
              TÀI KHOẢN ĐĂNG NHẬP
            </div>
            <h2 className="mt-1 text-2xl font-black">
              Tạo tài khoản cho {accountTeacher.full_name}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Tài khoản này sẽ có quyền Giáo viên và chỉ xem được lớp được phân công.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label>
              <div className="mb-2 text-sm font-bold">Email đăng nhập *</div>
              <input
                type="email"
                className="ui-input"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                placeholder="teacher@example.com"
                autoComplete="off"
              />
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">Mật khẩu *</div>
              <input
                type="password"
                className="ui-input"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                placeholder="Ít nhất 6 ký tự"
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              className="ui-btn"
              onClick={() => {
                setAccountTeacher(null);
                setAccountEmail("");
                setAccountPassword("");
                setAccountPasswordNew("");
              }}
              disabled={accountSaving}
            >
              Hủy
            </button>

            <button
              type="button"
              className="ui-btn ui-btn-primary"
              onClick={createTeacherAccount}
              disabled={accountSaving}
            >
              {accountSaving
                ? "Đang tạo..."
                : "🔐 Tạo tài khoản"}
            </button>
          </div>
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
                  // URL ảnh do người dùng nhập nên không thể giới hạn hostname cho next/image.
                  // eslint-disable-next-line @next/next/no-img-element
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
                {!teacher.profile_id && teacher.status === "active" && (
                  <button
                    className="ui-btn bg-blue-50 text-blue-700"
                    onClick={() => {
                      setAccountTeacher(teacher);
                      setAccountEmail("");
                      setAccountPassword("");
                      requestAnimationFrame(() => {
                        document.getElementById("teacher-account-editor")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      });
                    }}
                  >
                    🔐 Tạo tài khoản
                  </button>
                )}

                {teacher.profile_id && (
                  <>
                    <span
                      className={`ui-btn ${
                        teacher.account_active === false
                          ? "bg-slate-100 text-slate-600"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {teacher.account_active === false
                        ? "🔒 Đã khóa"
                        : "🟢 Đang hoạt động"}
                    </span>

                    <button
                      className="ui-btn bg-amber-50 text-amber-700"
                      onClick={() => {
                        const password = prompt(`Nhập mật khẩu mới cho ${teacher.full_name}:`);
                        if (password === null) return;
                        const trimmed = password.trim();
                        if (trimmed.length < 6) {
                          alert("Mật khẩu mới phải có ít nhất 6 ký tự.");
                          return;
                        }
                        setAccountPasswordNew(trimmed);
                        void accountActionWithPassword(teacher, trimmed);
                      }}
                      disabled={accountActionBusy !== null}
                    >
                      🔑 Đổi mật khẩu
                    </button>

                    <button
                      className={`ui-btn ${
                        teacher.account_active === false
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                      onClick={() =>
                        void accountAction(
                          teacher,
                          teacher.account_active === false ? "unlock" : "lock"
                        )
                      }
                      disabled={accountActionBusy !== null}
                    >
                      {teacher.account_active === false ? "🔓 Mở khóa" : "🔒 Khóa"}
                    </button>

                    <button
                      className="ui-btn bg-rose-50 text-rose-600"
                      onClick={() => void accountAction(teacher, "delete")}
                      disabled={accountActionBusy !== null}
                    >
                      🗑️ Xóa tài khoản
                    </button>
                  </>
                )}

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
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
