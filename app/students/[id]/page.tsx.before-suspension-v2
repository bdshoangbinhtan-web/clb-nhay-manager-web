 "use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Student = {
  id: string;
  full_name: string;
  status: string | null;
  created_at: string;
  branch_id: string | null;
  parent_phone: string | null;
  join_date: string | null;
};

type Branch = {
  id: string;
  name: string;
  address: string | null;
};

type DanceClass = {
  id: string;
  name: string;
  branch_id: string;
  monthly_fee: number;
  status: string;
};

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const id = params.id;
  const editMode = searchParams.get("edit") === "1";

  const [student, setStudent] = useState<Student | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allClasses, setAllClasses] = useState<DanceClass[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");

  const [name, setName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("active");

  const loadData = useCallback(async () => {
    setLoading(true);

    const [studentRes, branchesRes, classesRes, membershipRes] =
      await Promise.all([
        supabase
          .from("students")
          .select("id,full_name,status,created_at,branch_id,parent_phone,join_date")
          .eq("id", id)
          .single(),

        supabase
          .from("branches")
          .select("id,name,address")
          .order("name"),

        supabase
          .from("classes")
          .select("id,name,branch_id,monthly_fee,status")
          .order("name"),

        supabase
          .from("class_students")
          .select("class_id")
          .eq("student_id", id),
      ]);

    if (studentRes.error) {
      console.error(studentRes.error);
      setStudent(null);
      setLoading(false);
      return;
    }

    setStudent(studentRes.data);
    setBranches(branchesRes.data ?? []);
    setAllClasses(classesRes.data ?? []);

    const memberIds = new Set(
      (membershipRes.data ?? []).map((row) => row.class_id)
    );

    setClasses(
      (classesRes.data ?? []).filter((item) => memberIds.has(item.id))
    );

    setName(studentRes.data.full_name ?? "");
    setParentPhone(studentRes.data.parent_phone ?? "");
    setJoinDate(studentRes.data.join_date ?? "");
    setBranchId(studentRes.data.branch_id ?? "");
    setStatus(studentRes.data.status ?? "active");

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const availableClasses = useMemo(() => {
    const currentIds = new Set(classes.map((item) => item.id));

    return allClasses.filter(
      (item) =>
        item.status === "active" &&
        !currentIds.has(item.id) &&
        (!branchId || item.branch_id === branchId)
    );
  }, [allClasses, classes, branchId]);

  async function saveStudent() {
    if (!name.trim()) {
      alert("Vui lòng nhập tên học viên.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("students")
      .update({
        full_name: name.trim(),
        branch_id: branchId || null,
        status,
        parent_phone: parentPhone.trim() || null,
        join_date: joinDate || null,
      })
      .eq("id", id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
    router.replace(`/students/${id}`);
  }

  async function addClass() {
    if (!selectedClass) {
      alert("Vui lòng chọn lớp.");
      return;
    }

    setAddingClass(true);

    const { error } = await supabase
      .from("class_students")
      .insert({
        student_id: id,
        class_id: selectedClass,
      });

    setAddingClass(false);

    if (error) {
      alert(error.message);
      return;
    }

    setSelectedClass("");
    await loadData();
  }

  async function removeClass(classId: string) {
    if (!confirm("Xóa học viên khỏi lớp này? Học viên vẫn được giữ lại.")) {
      return;
    }

    const { error } = await supabase
      .from("class_students")
      .delete()
      .eq("student_id", id)
      .eq("class_id", classId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  if (loading) {
    return (
      <div className="ui-card p-12 text-center text-slate-400">
        Đang tải hồ sơ học viên...
      </div>
    );
  }

  if (!student) {
    return (
      <div className="ui-card p-12 text-center">
        <div className="text-5xl">😕</div>
        <h1 className="mt-4 text-xl font-black">
          Không tìm thấy học viên
        </h1>
        <Link
          href="/students"
          className="ui-btn ui-btn-primary mt-5 inline-flex"
        >
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  const branch = branches.find((item) => item.id === student.branch_id);
  const active = student.status === "active";

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/students"
            className="text-sm font-bold text-blue-600 hover:underline"
          >
            ← Học viên
          </Link>

          <div className="mt-3 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-100 via-white to-indigo-100 text-3xl shadow-[inset_0_1px_0_white,0_8px_18px_rgba(50,80,130,.10)]">
              👤
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                HỒ SƠ HỌC VIÊN
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-tight">
                {student.full_name}
              </h1>
            </div>
          </div>
        </div>

        {!editMode && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="ui-card p-5">
            <div className="text-sm font-bold text-slate-400">📞 SĐT phụ huynh</div>
            <div className="mt-2 text-xl font-black">
              {student.parent_phone || "Chưa cập nhật"}
            </div>
          </div>

          <div className="ui-card p-5">
            <div className="text-sm font-bold text-slate-400">📅 Ngày vào học</div>
            <div className="mt-2 text-xl font-black">
              {student.join_date
                ? new Date(student.join_date + "T00:00:00").toLocaleDateString("vi-VN")
                : "Chưa cập nhật"}
            </div>
          </div>
        </section>
      )}

      {!editMode && (
          <Link
            href={`/students/${id}?edit=1`}
            className="ui-btn ui-btn-blue flex w-fit items-center gap-2"
          >
            ✏️ Sửa hồ sơ
          </Link>
        )}
      </section>

      {editMode ? (
        <section className="ui-card p-6 sm:p-7">
          <div className="mb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
              CẬP NHẬT
            </div>
            <h2 className="mt-1 text-2xl font-black">
              Sửa thông tin học viên
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="mb-2 text-sm font-bold text-slate-700">
                Họ và tên
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ui-input"
              />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold text-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <div>
                <label className="block text-sm font-semibold">📞 SĐT phụ huynh</label>
                <input
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  placeholder="0901 234 567"
                  className="mt-2 w-full rounded-2xl border px-4 py-3"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold">📅 Ngày vào học</label>
                <input
                  type="date"
                  value={joinDate}
                  onChange={(e) => setJoinDate(e.target.value)}
                  className="mt-2 w-full rounded-2xl border px-4 py-3"
                />
              </div>
            </div>

            Cơ sở
              </div>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="ui-input"
              >
                <option value="">Chưa gán cơ sở</option>
                {branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold text-slate-700">
                Trạng thái
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="ui-input"
              >
                <option value="active">🟢 Đang học</option>
                <option value="inactive">⚪ Tạm ngưng</option>
              </select>
            </label>
          </div>

          <div className="mt-7 flex justify-end gap-3 border-t border-slate-100 pt-5">
            <Link
              href={`/students/${id}`}
              className="ui-btn ui-btn-light"
            >
              Hủy
            </Link>

            <button
              onClick={saveStudent}
              disabled={saving}
              className="ui-btn ui-btn-primary min-w-[140px]"
            >
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-3">
            <div className="ui-card p-6">
              <div className="text-sm font-semibold text-slate-400">
                Trạng thái
              </div>
              <div className="mt-3">
                <span className={`ui-pill ${active ? "ui-pill-active" : ""}`}>
                  {active ? "🟢 Đang học" : "⚪ Tạm ngưng"}
                </span>
              </div>
            </div>

            <div className="ui-card p-6">
              <div className="text-sm font-semibold text-slate-400">
                Cơ sở
              </div>
              <div className="mt-2 text-lg font-black">
                🏢 {branch?.name || "Chưa gán cơ sở"}
              </div>
              {branch?.address && (
                <div className="mt-1 text-sm text-slate-400">
                  {branch.address}
                </div>
              )}
            </div>

            <div className="ui-card p-6">
              <div className="text-sm font-semibold text-slate-400">
                Ngày tham gia
              </div>
              <div className="mt-2 text-lg font-black">
                📅{" "}
                {student.join_date ? new Date(student.join_date + "T00:00:00").toLocaleDateString("vi-VN") : "Chưa cập nhật"}
              </div>
            </div>
          </section>

          <section className="ui-card p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black">
                  📚 Các lớp đang học
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Một học viên có thể học nhiều lớp
                </p>
              </div>

              <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">
                {classes.length} lớp
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-[22px] bg-slate-50/80 p-4 sm:flex-row">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="ui-input flex-1"
              >
                <option value="">＋ Chọn lớp để thêm...</option>
                {availableClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} —{" "}
                    {new Intl.NumberFormat("vi-VN").format(
                      Number(item.monthly_fee)
                    )}{" "}
                    đ/tháng
                  </option>
                ))}
              </select>

              <button
                onClick={addClass}
                disabled={addingClass || !selectedClass}
                className="ui-btn ui-btn-primary whitespace-nowrap"
              >
                {addingClass ? "Đang thêm..." : "＋ Thêm vào lớp"}
              </button>
            </div>

            {classes.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">
                Học viên chưa tham gia lớp nào.
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {classes.map((item) => (
                  <div
                    key={item.id}
                    className="group rounded-[22px] bg-white p-4 shadow-[0_7px_18px_rgba(35,50,75,.07)] transition hover:-translate-y-1 hover:shadow-[0_13px_25px_rgba(35,50,75,.11)]"
                  >
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/branches/${item.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl">
                          💃
                        </div>

                        <div className="min-w-0">
                          <div className="truncate font-black">
                            {item.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            💰{" "}
                            {new Intl.NumberFormat("vi-VN").format(
                              Number(item.monthly_fee)
                            )}{" "}
                            đ/tháng
                          </div>
                        </div>
                      </Link>

                      <button
                        onClick={() => removeClass(item.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-sm shadow-none transition hover:bg-rose-100"
                        title="Xóa khỏi lớp"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
