"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  id: string;
  name: string;
  address: string | null;
};

type DanceClass = {
  id: string;
  branch_id: string;
  name: string;
  monthly_fee: number;
  status: string;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
};

const FEE_OPTIONS = [
  { value: "600000", label: "600.000 đ/tháng" },
  { value: "750000", label: "750.000 đ/tháng" },
  { value: "1500000", label: "1.500.000 đ/tháng" },
  { value: "custom", label: "Mức khác..." },
];

const money = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + " đ/tháng";


const formatSchedule = (
  days: string[] | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined
) => {
  const labels: Record<string, string> = {
    "2": "T2",
    "3": "T3",
    "4": "T4",
    "5": "T5",
    "6": "T6",
    "7": "T7",
    "0": "CN",
  };

  if (!days || days.length === 0) return "Chưa thiết lập lịch";

  const dayText = days.map((d) => labels[d] ?? d).join(" • ");
  const timeText =
    start && end
      ? ` • ${start.slice(0, 5)}–${end.slice(0, 5)}`
      : "";

  return dayText + timeText;
};

export default function BranchesPage() {
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");

  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<DanceClass | null>(null);

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("600000");
  const [status, setStatus] = useState("active");
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [branchResult, classResult] = await Promise.all([
      supabase
        .from("branches")
        .select("id,name,address")
        .order("name"),
      supabase
        .from("classes")
        .select("id,branch_id,name,monthly_fee,status,schedule_days,schedule_start,schedule_end")
        .order("name"),
    ]);

    if (branchResult.error) {
      alert(branchResult.error.message);
      setLoading(false);
      return;
    }

    if (classResult.error) {
      alert(classResult.error.message);
      setLoading(false);
      return;
    }

    setBranches(branchResult.data ?? []);
    setClasses(classResult.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches]
  );

  const filteredClasses = useMemo(() => {
    if (selectedBranch === "all") return classes;
    return classes.filter((item) => item.branch_id === selectedBranch);
  }, [classes, selectedBranch]);

  function openAdd() {
    setEditing(null);
    setName("");
    setBranchId(
      selectedBranch !== "all" ? selectedBranch : branches[0]?.id ?? ""
    );
    setMonthlyFee("600000");
    setScheduleDays([]);
    setScheduleStart("");
    setScheduleEnd("");
    setStatus("active");
    setModal(true);
  }

  function openEdit(item: DanceClass) {
    setEditing(item);
    setName(item.name);
    setBranchId(item.branch_id);
    setMonthlyFee(String(item.monthly_fee));
    setScheduleDays(item.schedule_days ?? []);
    setScheduleStart(item.schedule_start?.slice(0, 5) ?? "");
    setScheduleEnd(item.schedule_end?.slice(0, 5) ?? "");
    setStatus(item.status);
    setModal(true);
  }

  async function saveClass() {
    if (!name.trim() || !branchId) {
      alert("Vui lòng nhập tên lớp và chọn cơ sở.");
      return;
    }

    const fee = Number(monthlyFee);

    if (!fee || fee <= 0) {
      alert("Học phí không hợp lệ.");
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      branch_id: branchId,
      monthly_fee: fee,
      status,
      schedule_days: scheduleDays,
      schedule_start: scheduleStart || null,
      schedule_end: scheduleEnd || null,
    };

    const result = editing
      ? await supabase.from("classes").update(payload).eq("id", editing.id)
      : await supabase.from("classes").insert(payload);

    setSaving(false);

    if (result.error) {
      alert(result.error.message);
      return;
    }

    setModal(false);
    await loadData();
  }

  const branchCount = (branchId: string) =>
    classes.filter((item) => item.branch_id === branchId).length;

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 text-sm font-semibold text-blue-600">
            QUẢN LÝ TRUNG TÂM
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Cơ sở & Lớp
          </h1>
          <p className="mt-2 text-sm text-slate-500 sm:text-base">
            Quản lý cơ sở, lớp học và mức học phí
          </p>
        </div>

        <button
          onClick={openAdd}
          className="ui-btn ui-btn-primary flex w-fit items-center gap-2 px-5"
        >
          <span className="text-xl">＋</span>
          Thêm lớp
        </button>
      </section>

      {/* BRANCHES */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black">
              🏢 Cơ sở
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Chọn cơ sở để xem nhanh các lớp
            </p>
          </div>

          <button
            onClick={() => setSelectedBranch("all")}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
              selectedBranch === "all"
                ? "bg-slate-900 text-white shadow-[0_4px_0_rgba(15,23,42,.18)]"
                : "bg-white text-slate-500 shadow-[0_5px_15px_rgba(30,45,70,.07)] hover:-translate-y-0.5"
            }`}
          >
            Tất cả cơ sở
          </button>
        </div>

        {loading ? (
          <div className="ui-card p-8 text-center text-slate-400">
            Đang tải dữ liệu...
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {branches.map((branch) => {
              const active = selectedBranch === branch.id;

              return (
                <button
                  key={branch.id}
                  onClick={() =>
                    setSelectedBranch(active ? "all" : branch.id)
                  }
                  className={`group relative overflow-hidden rounded-[26px] border p-6 text-left transition-all duration-200 ${
                    active
                      ? "border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-[0_9px_0_rgba(15,23,42,.18),0_20px_35px_rgba(15,23,42,.15)]"
                      : "border-white bg-white/85 text-slate-900 shadow-[0_12px_30px_rgba(35,50,75,.08)] hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(35,50,75,.12)]"
                  } active:translate-y-1 active:shadow-[0_2px_0_rgba(15,23,42,.15)]`}
                >
                  <div className="flex items-center gap-5">
                    <div
                      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] text-3xl shadow-[inset_0_1px_0_white,0_7px_15px_rgba(30,45,70,.10)] ${
                        active
                          ? "bg-white/15"
                          : "bg-gradient-to-br from-blue-50 to-white"
                      }`}
                    >
                      🏢
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-black">{branch.name}</div>
                      <div
                        className={`mt-1 truncate text-sm ${
                          active ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        📍 {branch.address || "Chưa có địa chỉ"}
                      </div>

                      <div
                        className={`mt-3 flex items-center gap-2 text-sm font-bold ${
                          active ? "text-slate-200" : "text-slate-600"
                        }`}
                      >
                        📚 {branchCount(branch.id)} lớp
                      </div>
                    </div>

                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl shadow-[0_6px_15px_rgba(30,45,70,.10)] ${
                        active
                          ? "bg-white/15 text-white"
                          : "bg-white text-slate-700"
                      }`}
                    >
                      →
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* CLASSES */}
      <section>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">


          <div className="rounded-2xl bg-white/75 px-4 py-2 text-sm font-semibold text-slate-500 shadow-[0_6px_18px_rgba(30,45,70,.06)]">
            {selectedBranch === "all"
              ? "Tất cả cơ sở"
              : branchMap.get(selectedBranch)?.name}
          </div>
        </div>

        {filteredClasses.length === 0 ? (
          <div className="ui-card p-12 text-center">
            <div className="text-5xl">📚</div>
            <div className="mt-4 text-lg font-black">Chưa có lớp</div>
            <p className="mt-1 text-sm text-slate-400">
              Hãy thêm lớp đầu tiên cho cơ sở này.
            </p>
            <button onClick={openAdd} className="ui-btn ui-btn-primary mt-5">
              ＋ Thêm lớp
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredClasses.map((item) => {
              const branch = branchMap.get(item.branch_id);
              const active = item.status === "active";

              return (
                <article
                  key={item.id}
                  className="group ui-card relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(35,50,75,.13)]"
                >
                  <div className="flex gap-4">
                    {/* CLASS AVATAR */}
                    <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-100 via-white to-indigo-100 text-4xl shadow-[inset_0_1px_0_white,0_8px_18px_rgba(50,80,130,.10)]">
                      💃
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[17px] font-black text-slate-900">
                        {item.name}
                      </h3>

                      <div className="mt-2 truncate text-sm text-slate-500">
                        🏢 {branch?.name || "Chưa gán cơ sở"}
                      </div>

                      <div className="mt-2 text-sm font-bold text-slate-700">
                        💰 {money(Number(item.monthly_fee))}
                      </div>

                      <div className="mt-3">
                        <span
                          className={`ui-pill ${
                            active ? "ui-pill-active" : ""
                          }`}
                        >
                          <span>{active ? "🟢" : "⚪"}</span>
                          {active ? "Đang hoạt động" : "Tạm ngưng"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-sm font-bold text-slate-500">
                        📅 {formatSchedule(item.schedule_days, item.schedule_start, item.schedule_end)}
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                    <Link
                      href={`/branches/${item.id}`}
                      className="ui-btn ui-btn-light flex items-center justify-center gap-2 text-sm"
                    >
                      👁 <span>Xem chi tiết</span>
                    </Link>

                    <button
                      onClick={() => openEdit(item)}
                      className="ui-btn ui-btn-blue flex items-center justify-center gap-2 text-sm"
                    >
                      ✏️ <span>Sửa</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL */}
<div>
            <h2 className="flex items-center gap-2 text-xl font-black">
              📚 {selectedBranch === "all" ? "Tất cả lớp" : "Lớp tại cơ sở đã chọn"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {filteredClasses.length} lớp đang hiển thị
            </p>
          </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white shadow-[0_30px_80px_rgba(15,23,42,.25)]">

            {/* HEADER */}
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-7 py-6 backdrop-blur">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                  {editing ? "CẬP NHẬT" : "TẠO MỚI"}
                </div>
                <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                  {editing ? "Sửa lớp học" : "Thêm lớp học"}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-400">
                  Thông tin lớp, lịch học và học phí
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModal(false)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-black text-slate-700 shadow-[0_5px_0_rgba(30,45,70,.08)] transition-all hover:bg-slate-200 active:translate-y-1 active:shadow-none"
              >
                ×
              </button>
            </div>

            {/* FORM */}
            <div className="space-y-6 p-7">

              {/* TÊN LỚP */}
              <label className="block">
                <div className="mb-2 text-sm font-black text-slate-700">
                  Tên lớp
                </div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="ui-input"
                  placeholder="Ví dụ: Sunny Kids"
                />
              </label>

              {/* CƠ SỞ */}
              <label className="block">
                <div className="mb-2 text-sm font-black text-slate-700">
                  Cơ sở
                </div>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="ui-input"
                >
                  <option value="">Chọn cơ sở</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* HỌC PHÍ */}
              <label className="block">
                <div className="mb-2 text-sm font-black text-slate-700">
                  💰 Học phí tháng
                </div>
                <select
                  value={
                    FEE_OPTIONS.some((x) => x.value === monthlyFee)
                      ? monthlyFee
                      : "custom"
                  }
                  onChange={(e) => {
                    if (e.target.value !== "custom") {
                      setMonthlyFee(e.target.value);
                    } else {
                      setMonthlyFee("");
                    }
                  }}
                  className="ui-input"
                >
                  {FEE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {!FEE_OPTIONS.some((x) => x.value === monthlyFee) && (
                  <input
                    type="number"
                    min="0"
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(e.target.value)}
                    className="ui-input mt-3"
                    placeholder="Nhập số tiền"
                  />
                )}
              </label>

              {/* LỊCH HỌC */}
              <div className="rounded-[26px] bg-slate-50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
                <div className="mb-4">
                  <div className="text-sm font-black text-slate-800">
                    📅 Ngày học
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-400">
                    Chọn những ngày lớp có lịch học
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {[
                    ["2", "T2"],
                    ["3", "T3"],
                    ["4", "T4"],
                    ["5", "T5"],
                    ["6", "T6"],
                    ["7", "T7"],
                    ["CN", "CN"],
                  ].map(([value, label]) => {
                    const selected = scheduleDays.includes(value);

                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setScheduleDays((current) =>
                            current.includes(value)
                              ? current.filter((item) => item !== value)
                              : [...current, value]
                          )
                        }
                        className={`rounded-2xl px-3 py-3 text-sm font-black transition-all ${
                          selected
                            ? "bg-blue-600 text-white shadow-[0_5px_0_rgba(37,99,235,.28)] active:translate-y-1 active:shadow-none"
                            : "bg-white text-slate-500 shadow-[0_5px_0_rgba(30,45,70,.08)] hover:bg-blue-50 hover:text-blue-600 active:translate-y-1 active:shadow-none"
                        }`}
                      >
                        {selected ? "✓ " : ""}
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* GIỜ HỌC */}
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-sm font-black text-slate-700">
                      🕐 Giờ bắt đầu
                    </div>
                    <input
                      type="time"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className="ui-input bg-white"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-black text-slate-700">
                      🕐 Giờ kết thúc
                    </div>
                    <input
                      type="time"
                      value={scheduleEnd}
                      onChange={(e) => setScheduleEnd(e.target.value)}
                      className="ui-input bg-white"
                    />
                  </label>
                </div>
              </div>

              {/* TRẠNG THÁI */}
              <label className="block">
                <div className="mb-2 text-sm font-black text-slate-700">
                  Trạng thái
                </div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="ui-input"
                >
                  <option value="active">🟢 Đang hoạt động</option>
                  <option value="inactive">⚪ Tạm ngưng</option>
                </select>
              </label>

              {/* ACTIONS */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-6">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="ui-btn ui-btn-light"
                >
                  Hủy
                </button>

                <button
                  type="button"
                  onClick={saveClass}
                  disabled={saving}
                  className="ui-btn ui-btn-primary min-w-[150px]"
                >
                  {saving
                    ? "Đang lưu..."
                    : editing
                      ? "Lưu thay đổi"
                      : "Tạo lớp"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
