/* eslint-disable @typescript-eslint/no-explicit-any */
 "use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { vietnamCurrentMonth, vietnamToday } from "@/lib/vietnam-date";

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
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
  status: string;
};

export default function NewStudentPage() {
  const router = useRouter();
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [name, setName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState<"name" | "date" | null>(null);

  function startVoice(field: "name" | "date") {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Trình duyệt này chưa hỗ trợ nhập giọng nói. Hãy dùng Chrome hoặc Safari trên điện thoại.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setListening(field);

    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
      if (!transcript) return;

      if (field === "name") {
        setName(transcript.replace(/[.!?]+$/, "").trim());
      } else {
        const normalized = transcript
          .toLowerCase()
          .replace(/ngày/g, "")
          .replace(/tháng/g, "/")
          .replace(/năm/g, "/")
          .replace(/\s+/g, " ")
          .trim();

        const match = normalized.match(/(\d{1,2})\s*[\/]\s*(\d{1,2})\s*[\/]\s*(\d{4})/);
        if (match) {
          const [, d, m, y] = match;
          setJoinDate(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
        } else {
          const slash = transcript.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
          if (slash) {
            const [, d, m, y] = slash;
            setJoinDate(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
          } else {
            alert(`Không nhận ra ngày "${transcript}". Hãy nói ví dụ: 1 tháng 9 năm 2026.`);
          }
        }
      }
    };

    recognition.onerror = () => setListening(null);
    recognition.onend = () => setListening(null);
    recognition.start();
  }

  const loadData = useCallback(async () => {
    const [branchesRes, classesRes] = await Promise.all([
      supabase.from("branches").select("id,name,address").order("name"),
      supabase
        .from("classes")
        .select("id,name,branch_id,monthly_fee,schedule_days,schedule_start,schedule_end,status")
        .eq("status", "active")
        .order("name"),
    ]);

    setBranches(branchesRes.data ?? []);
    setClasses(classesRes.data ?? []);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const branchClasses = classes.filter(
    (item) => !branchId || item.branch_id === branchId
  );

  function toggleClass(id: string) {
    setSelectedClasses((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function calculateNewStudentTuition(
    classItem: DanceClass,
    joinDateValue: string,
    billingMonth: string
  ) {
    const monthlyFee = Number(classItem.monthly_fee || 0);

    // 750k, 1.5tr và các mức khác: lấy đúng giá tháng.
    // Chỉ lớp 600k mới tính theo số buổi thực tế.
    if (monthlyFee !== 600000) {
      return monthlyFee;
    }

    const startMinutes = classItem.schedule_start
      ? Number(classItem.schedule_start.slice(0, 2)) * 60 +
        Number(classItem.schedule_start.slice(3, 5))
      : 0;

    const endMinutes = classItem.schedule_end
      ? Number(classItem.schedule_end.slice(0, 2)) * 60 +
        Number(classItem.schedule_end.slice(3, 5))
      : 0;

    const durationMinutes =
      endMinutes > startMinutes ? endMinutes - startMinutes : 60;

    const feePerLesson = (durationMinutes / 60) * 50000;

    if (!joinDateValue) return monthlyFee;

    const [year, month] = billingMonth.split("-").map(Number);
    const joined = new Date(joinDateValue + "T00:00:00");
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    if (joined > lastDay) return 0;
    if (joined < firstDay) return monthlyFee;

    const dayMap: Record<string, number> = {
      "2": 1,
      "3": 2,
      "4": 3,
      "5": 4,
      "6": 5,
      "7": 6,
      "CN": 0,
    };

    const scheduleDays = Array.isArray(classItem.schedule_days)
      ? classItem.schedule_days
      : [];

    const jsDays = scheduleDays
      .map((day) => dayMap[String(day)])
      .filter((day): day is number => day !== undefined);

    let lessons = 0;
    const cursor = new Date(joined);

    while (cursor <= lastDay) {
      if (jsDays.includes(cursor.getDay())) lessons++;
      cursor.setDate(cursor.getDate() + 1);
    }

    return Math.min(lessons * feePerLesson, monthlyFee);
  }

  async function createStudent() {
    if (!name.trim()) {
      alert("Vui lòng nhập tên học viên.");
      return;
    }

    if (!joinDate) {
      alert("Vui lòng nhập ngày tham gia.");
      return;
    }

    setSaving(true);

    const localToday = vietnamToday();
    const effectiveJoinDate = joinDate || localToday;

    const { data, error } = await supabase
      .from("students")
      .insert({
        full_name: name.trim(),
        parent_phone: parentPhone.trim() || null,
        join_date: effectiveJoinDate,
        branch_id: branchId || null,
        status,
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      alert(error.message);
      return;
    }

    if (selectedClasses.length) {
      const { error: classError } = await supabase
        .from("class_students")
        .insert(
          selectedClasses.map((classId) => ({
            student_id: data.id,
            class_id: classId,
          }))
        );

      if (classError) {
        setSaving(false);
        alert(
          "Đã tạo học viên nhưng chưa gán được lớp: " +
            classError.message
        );
        router.push(`/students/${data.id}`);
        return;
      }
    }

    // Tự tạo học phí tháng hiện tại cho từng lớp vừa gán.
    // Mỗi học viên + lớp + tháng chỉ có đúng 1 khoản tuition.
    if (selectedClasses.length && status === "active") {
      const billingMonth = vietnamCurrentMonth();
      const billingDate = `${billingMonth}-01`;

      const tuitionRows = selectedClasses.flatMap((classId) => {
        const classItem = classes.find((item) => item.id === classId);
        if (!classItem) return [];

        const amount = calculateNewStudentTuition(
          classItem,
          effectiveJoinDate,
          billingMonth
        );

        // Nếu ngày vào học nằm sau tháng đang tính thì chưa phát sinh học phí.
        if (amount <= 0) return [];

        return [
          {
            student_id: data.id,
            class_id: classItem.id,
            branch_id: branchId || classItem.branch_id || null,
            billing_month: billingDate,
            description: `Học phí ${billingMonth.slice(5, 7)}/${billingMonth.slice(0, 4)}`,
            amount_due: amount,
            amount_paid: 0,
            payment_date: null,
            note: "Tự tạo khi thêm học viên",
          },
        ];
      });

      if (tuitionRows.length) {
        const { error: tuitionError } = await supabase
          .from("tuition")
          .insert(tuitionRows);

        if (tuitionError) {
          setSaving(false);
          alert(
            "⚠️ Đã tạo học viên và gán lớp nhưng chưa tạo được học phí: " +
              tuitionError.message
          );
          router.push(`/students/${data.id}`);
          return;
        }
      }
    }

    setSaving(false);
    router.push(`/students/${data.id}`);
  }

  return (
    <div className="space-y-6">
      <section>
        <button
          onClick={() => router.back()}
          className="text-sm font-bold text-blue-600 hover:underline"
        >
          ← Học viên
        </button>

        <div className="mt-4">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
            TẠO MỚI
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            Thêm học viên
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Tạo hồ sơ và gán một hoặc nhiều lớp ngay từ đầu.
          </p>
        </div>
      </section>

      <section className="ui-card p-6 sm:p-8">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="mb-2 text-sm font-bold text-slate-700">
              Họ và tên *
            </div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ui-input min-w-0 flex-1"
                placeholder="Nhập họ tên học viên"
                autoFocus
              />
              <button
                type="button"
                onClick={() => startVoice("name")}
                className={`shrink-0 rounded-xl px-4 text-xl font-black transition active:scale-95 ${
                  listening === "name"
                    ? "bg-red-100 text-red-600 animate-pulse"
                    : "bg-blue-50 text-blue-700"
                }`}
                title="Nhập tên bằng giọng nói"
                aria-label="Nhập tên bằng giọng nói"
              >
                {listening === "name" ? "🔴" : "🎙️"}
              </button>
            </div>          </label>

          <label className="block">
            <div className="mb-2 text-sm font-bold text-slate-700">
              Ngày tham gia *
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                className="ui-input min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={() => startVoice("date")}
                className={`shrink-0 rounded-xl px-4 text-xl font-black transition active:scale-95 ${
                  listening === "date"
                    ? "bg-red-100 text-red-600 animate-pulse"
                    : "bg-blue-50 text-blue-700"
                }`}
                title="Nhập ngày tham gia bằng giọng nói"
                aria-label="Nhập ngày tham gia bằng giọng nói"
              >
                {listening === "date" ? "🔴" : "🎙️"}
              </button>
            </div>
            <div className="mt-1.5 text-xs text-slate-400">
              Dùng để tính học phí tháng đầu theo số buổi thực tế.
            </div>
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-bold text-slate-700">
              Cơ sở
            </div>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setSelectedClasses([]);
              }}
              className="ui-input"
            >
              <option value="">Chưa gán cơ sở</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
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

        <div className="mt-7 border-t border-slate-100 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black">📚 Gán lớp</h2>
              <p className="mt-1 text-sm text-slate-400">
                Có thể chọn nhiều lớp
              </p>
            </div>

            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">
              {selectedClasses.length} lớp
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branchClasses.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
                Chưa có lớp hoạt động tại cơ sở này.
              </div>
            ) : (
              branchClasses.map((item) => {
                const selected = selectedClasses.includes(item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleClass(item.id)}
                    className={`rounded-[20px] border p-4 text-left transition-all active:translate-y-1 ${
                      selected
                        ? "border-blue-400 bg-blue-50 shadow-[0_6px_0_rgba(37,99,235,.12)]"
                        : "border-white bg-white shadow-[0_7px_18px_rgba(35,50,75,.07)] hover:-translate-y-1"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-white text-xl">
                        💃
                      </div>

                      <div className="min-w-0 flex-1">
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

                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          selected
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-300"
                        }`}
                      >
                        ✓
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:flex sm:justify-end">
          <button
            onClick={() => router.back()}
            className="ui-btn ui-btn-light w-full sm:w-auto"
          >
            Hủy
          </button>

          <button
            onClick={createStudent}
            disabled={saving}
            className="ui-btn ui-btn-primary w-full min-w-0 sm:w-auto sm:min-w-[150px]"
          >
            {saving ? "Đang tạo..." : "Tạo học viên"}
          </button>
        </div>
      </section>
    </div>
  );
}
