/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamCurrentMonth } from "@/lib/vietnam-date";

type Student = {
  id: string;
  full_name: string;
  branch_id: string | null;
  join_date: string | null;
  status: string | null;
};

type Branch = {
  id: string;
  name: string;
};

type ClassItem = {
  id: string;
  name: string;
  branch_id: string;
  monthly_fee: number;
  status: string;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
};

type Tuition = {
  id: string;
  student_id: string;
  class_id: string | null;
  branch_id: string | null;
  billing_month: string;
  description: string | null;
  amount_due: number;
  amount_paid: number;
  payment_date: string | null;
  note: string | null;
  status: string;
};

type TuitionPayment = {
  id: string;
  tuition_id: string;
  amount: number;
  payment_method: "cash" | "transfer" | string | null;
  payment_date: string | null;
  receipt_no: string | null;
};


type VoicePayment = {
  item: Tuition;
  amount: number;
  method: "cash" | "transfer";
  transcript: string;
};

const DAY_MAP: Record<string, number> = {
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  "6": 5,
  "7": 6,
  "CN": 0,
};

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

function monthLabel(value: string) {
  if (!value) return "";
  const [y, m] = value.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

function lessonsInMonth(
  joinDate: string | null,
  billingMonth: string,
  scheduleDays: string[] | null
) {
  if (!billingMonth || !scheduleDays?.length) return 0;

  const [year, month] = billingMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);

  let start = first;

  if (joinDate) {
    const joined = new Date(joinDate + "T00:00:00");

    if (
      joined.getFullYear() > year ||
      (joined.getFullYear() === year && joined.getMonth() > month - 1)
    ) {
      return 0;
    }

    if (joined > start) start = joined;
  }

  const wanted = scheduleDays
    .map((d) => DAY_MAP[d])
    .filter((d): d is number => d !== undefined);

  let count = 0;

  for (
    const d = new Date(start);
    d <= last;
    d.setDate(d.getDate() + 1)
  ) {
    if (wanted.includes(d.getDay())) count++;
  }

  return count;
}

export default function TuitionPage() {
  const supabase = createClient();

  const [isAdmin, setIsAdmin] = useState(false);

  const [tuition, setTuition] = useState<Tuition[]>([]);
  const [payments, setPayments] = useState<TuitionPayment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [search, setSearch] = useState("");
  const [billingMonth, setBillingMonth] = useState(
    vietnamCurrentMonth()
  );

  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [showStudentSearch, setShowStudentSearch] = useState(false);
  const [classId, setClassId] = useState("");
  const [studentClassIds, setStudentClassIds] = useState<string[]>([]);
  const [amountDue, setAmountDue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [voicePayment, setVoicePayment] = useState<VoicePayment | null>(null);
  const [voicePaymentListening, setVoicePaymentListening] = useState(false);
  const [classMemberships, setClassMemberships] = useState<
    { student_id: string; class_id: string; status: string | null }[]
  >([]);
  const [selectedTuitionClassId, setSelectedTuitionClassId] = useState("");
  const [classStudentSearch, setClassStudentSearch] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);

  async function loadData() {
    const { data: authData } = await supabase.auth.getUser();

    if (authData.user) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      setIsAdmin(profileData?.role === "admin");
    }

    setLoading(true);

    const [
      { data: tuitionData, error: tuitionError },
      { data: paymentData, error: paymentError },
      { data: studentData, error: studentError },
      { data: branchData, error: branchError },
      { data: classData, error: classError },
      { data: membershipData, error: membershipError },
    ] = await Promise.all([
      supabase
        .from("tuition")
        .select("*")
        .order("billing_month", { ascending: false }),

      supabase
        .from("tuition_payments")
        .select("id,tuition_id,amount,payment_method,payment_date,receipt_no")
        .order("payment_date", { ascending: false }),

      supabase
        .from("students")
        .select("id,full_name,branch_id,join_date,status")
        .order("full_name"),

      supabase.from("branches").select("id,name").order("name"),

      supabase
        .from("classes")
        .select(
          "id,name,branch_id,monthly_fee,status,schedule_days,schedule_start,schedule_end"
        )
        .order("name"),
      supabase
        .from("class_students")
        .select("student_id,class_id,status")
        .eq("status", "active"),
    ]);

    if (tuitionError) {
      alert(tuitionError.message);
      return;
    }

    if (paymentError) {
      alert(paymentError.message);
      return;
    }

    if (studentError) {
      alert(studentError.message);
      return;
    }

    if (branchError) {
      alert(branchError.message);
      return;
    }

    if (classError) {
      alert(classError.message);
      return;
    }

    if (membershipError) {
      alert(membershipError.message);
      return;
    }

    setTuition(tuitionData ?? []);
    setPayments(paymentData ?? []);
    setStudents(studentData ?? []);
    setBranches(branchData ?? []);
    setClasses(classData ?? []);
    setClassMemberships(membershipData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedStudent = students.find((x) => x.id === studentId);

  const studentClasses = useMemo(() => {
    if (!studentId) return [];

    const assigned = new Set(studentClassIds);

    return classes.filter(
      (c) => c.status === "active" && assigned.has(c.id)
    );
  }, [studentId, studentClassIds, classes]);


  const activeClasses = useMemo(
    () => classes.filter((c) => c.status === "active"),
    [classes]
  );

  const activeMemberships = useMemo(
    () => classMemberships.filter((m) => m.status === "active"),
    [classMemberships]
  );

  const selectedTuitionClass = classes.find(
    (c) => c.id === selectedTuitionClassId
  );

  const selectedClassStudents = useMemo(() => {
    if (!selectedTuitionClassId) return [];

    const ids = new Set(
      activeMemberships
        .filter((m) => m.class_id === selectedTuitionClassId)
        .map((m) => m.student_id)
    );

    const q = classStudentSearch
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");

    return students
      .filter((student) => {
        if (!ids.has(student.id)) return false;

        if (!q) return true;

        return student.full_name
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .includes(q);
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"));
  }, [
    selectedTuitionClassId,
    activeMemberships,
    students,
    classStudentSearch,
  ]);

  function tuitionForStudentClass(studentId: string, classId: string) {
    return tuition.find(
      (item) =>
        item.student_id === studentId &&
        item.class_id === classId &&
        item.billing_month === `${billingMonth}-01`
    );
  }

  function classStats(classId: string) {
    const studentIds = activeMemberships
      .filter((m) => m.class_id === classId)
      .map((m) => m.student_id);

    const records = studentIds
      .map((studentId) => tuitionForStudentClass(studentId, classId))
      .filter(Boolean) as Tuition[];

    const paid = records.filter(
      (item) => Number(item.amount_due) > 0 &&
        Number(item.amount_paid) >= Number(item.amount_due)
    ).length;

    const debt = records.filter(
      (item) => Number(item.amount_due) > Number(item.amount_paid)
    ).length;

    const debtAmount = records.reduce(
      (sum, item) =>
        sum + Math.max(Number(item.amount_due) - Number(item.amount_paid), 0),
      0
    );

    return {
      total: studentIds.length,
      paid,
      debt,
      debtAmount,
    };
  }

  function startVoiceSearch() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceSupported(false);
      alert(
        "Trình duyệt này chưa hỗ trợ nhập giọng nói. Bạn có thể dùng Chrome/Cốc Cốc trên điện thoại."
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim() || "";

      if (text) {
        setClassStudentSearch(text);
        setSearch(text);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }


  function normalizeVoiceText(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/đ/g, "d")
      .replace(/[.,!?;:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findVoiceStudent(transcript: string) {
    if (!selectedTuitionClassId) return null;

    const text = normalizeVoiceText(transcript);

    const candidates = selectedClassStudents
      .map((student) => ({
        student,
        normalized: normalizeVoiceText(student.full_name),
      }))
      .sort((a, b) => b.normalized.length - a.normalized.length);

    return (
      candidates.find(
        (candidate) =>
          text.includes(candidate.normalized) ||
          candidate.normalized.includes(text)
      )?.student ?? null
    );
  }

  function parseVoicePayment(transcript: string) {
    const text = normalizeVoiceText(transcript);

    const student = findVoiceStudent(transcript);

    if (!student) {
      alert(
        `Không tìm thấy học viên trong lớp này.\n\nBạn có thể nói rõ họ tên, ví dụ:\n"Thu Bùi Quỳnh Anh tháng 9 chuyển khoản"`
      );
      return;
    }

    const item = tuitionForStudentClass(
      student.id,
      selectedTuitionClassId
    );

    if (!item) {
      alert(
        `${student.full_name} chưa có học phí ${monthLabel(
          billingMonth
        )} cho lớp này.`
      );
      return;
    }

    const remain = Math.max(
      Number(item.amount_due) - Number(item.amount_paid),
      0
    );

    if (remain <= 0) {
      alert(`${student.full_name} đã đóng đủ học phí kỳ này.`);
      return;
    }

    let method: "cash" | "transfer" | null = null;

    if (
      text.includes("chuyen khoan") ||
      text.includes("chuyen khoan") ||
      text.includes("ck")
    ) {
      method = "transfer";
    } else if (
      text.includes("tien mat") ||
      text.includes("tiền mặt")
    ) {
      method = "cash";
    }

    if (!method) {
      alert(
        `Đã nhận diện ${student.full_name} nhưng chưa biết phương thức thanh toán.\n\n` +
        `Hãy nói lại:\n` +
        `"Thu ${student.full_name} chuyển khoản"\nhoặc\n` +
        `"Thu ${student.full_name} tiền mặt"`
      );
      return;
    }

    const monthMatch = text.match(/thang\s+(\d{1,2})/);

    if (monthMatch) {
      const spokenMonth = Number(monthMatch[1]);
      const selectedMonth = Number(billingMonth.split("-")[1]);

      if (spokenMonth !== selectedMonth) {
        alert(
          `Bạn đang mở ${monthLabel(
            billingMonth
          )}, nhưng vừa nói tháng ${spokenMonth}.\n\n` +
          `Hãy chọn đúng kỳ trước khi thu tiền.`
        );
        return;
      }
    }

    setVoicePayment({
      item,
      amount: remain,
      method,
      transcript,
    });
  }

  function startVoicePayment() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Trình duyệt này chưa hỗ trợ nhập giọng nói. Hãy dùng Chrome/Cốc Cốc."
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setVoicePaymentListening(true);

    recognition.onresult = (event: any) => {
      const transcript =
        event.results?.[0]?.[0]?.transcript?.trim() || "";

      if (transcript) {
        parseVoicePayment(transcript);
      }
    };

    recognition.onerror = () => {
      setVoicePaymentListening(false);
    };

    recognition.onend = () => {
      setVoicePaymentListening(false);
    };

    recognition.start();
  }

  async function loadStudentClasses(id: string) {
    setStudentId(id);
    setClassId("");
    setAmountDue("");

    if (!id) return;

    const { data, error } = await supabase
      .from("class_students")
      .select("class_id")
      .eq("student_id", id)
      .eq("status", "active");

    if (error) {
      alert(error.message);
      return;
    }

    const ids = (data ?? []).map((x) => x.class_id);
    setStudentClassIds(ids);

    const myClasses = classes.filter(
      (c) => c.status === "active" && ids.includes(c.id)
    );

    if (myClasses.length === 1) {
      setClassId(myClasses[0].id);
      calculateAmount(myClasses[0], students.find((s) => s.id === id));
    }
  }

  function calculateAmount(
    classItem: ClassItem,
    student = selectedStudent
  ) {
    if (!student) return;

    const lessons = lessonsInMonth(
      student.join_date,
      billingMonth,
      classItem.schedule_days
    );

    // Đơn giá chuẩn: 50.000đ / giờ.
    // Tiền mỗi buổi được tính theo thời lượng thực tế của lớp.
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

    if (!student.join_date) {
      setAmountDue(String(classItem.monthly_fee));
      return;
    }

    const [year, month] = billingMonth.split("-").map(Number);
    const joined = new Date(student.join_date + "T00:00:00");

    const isFirstMonth =
      joined.getFullYear() === year &&
      joined.getMonth() === month - 1;

    if (isFirstMonth) {
      const firstMonthFee = Math.min(
        lessons * feePerLesson,
        Number(classItem.monthly_fee)
      );

      setAmountDue(String(firstMonthFee));
    } else if (joined < new Date(year, month - 1, 1)) {
      setAmountDue(String(classItem.monthly_fee));
    } else {
      setAmountDue("0");
    }
  }

  useEffect(() => {
    const selected = classes.find((c) => c.id === classId);
    if (selected && selectedStudent) {
      calculateAmount(selected, selectedStudent);
    }
  }, [billingMonth, classId, selectedStudent, classes]);


  async function createMonthlyTuition() {
    if (!billingMonth) {
      alert("Hãy chọn kỳ học phí.");
      return;
    }

    if (bulkCreating) return;

    const ok = window.confirm(
      `Tạo học phí ${monthLabel(billingMonth)} cho toàn bộ học viên đang học?`
    );

    if (!ok) return;

    setBulkCreating(true);

    try {
      const billingDate = `${billingMonth}-01`;

      // Lấy toàn bộ học viên đang được gán lớp
      const { data: memberships, error: membershipError } = await supabase
        .from("class_students")
        .select("student_id,class_id")
        .eq("status", "active");

      if (membershipError) {
        alert("Không lấy được danh sách lớp của học viên: " + membershipError.message);
        return;
      }

      // Các khoản đã tồn tại trong tháng
      const { data: existingRows, error: existingError } = await supabase
        .from("tuition")
        .select("student_id,class_id,billing_month")
        .eq("billing_month", billingDate);

      if (existingError) {
        alert("Không kiểm tra được học phí đã tạo: " + existingError.message);
        return;
      }

      const existingKeys = new Set(
        (existingRows || []).map(
          (x) => `${x.student_id}__${x.class_id}__${x.billing_month}`
        )
      );

      const rows: Array<{
        student_id: string;
        class_id: string;
        branch_id: string | null;
        billing_month: string;
        description: string;
        amount_due: number;
        amount_paid: number;
        payment_date: string | null;
        note: string;
      }> = [];

      let skipped = 0;

      for (const membership of memberships || []) {
        const student = students.find((x) => x.id === membership.student_id);
        const classItem = classes.find(
          (x) => x.id === membership.class_id && x.status === "active"
        );

        if (!student || student.status !== "active" || !classItem) continue;

        const key = `${student.id}__${classItem.id}__${billingDate}`;

        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }

        const monthlyFee = Number(classItem.monthly_fee || 0);

        // QUY TẮC HỌC PHÍ:
        // 600.000đ: tính 50.000đ/giờ theo số buổi thực tế, tối đa 600.000đ.
        // 750.000đ / 1.500.000đ / mức khác: lấy đúng monthly_fee.
        let amount = monthlyFee;

        if (monthlyFee === 600000 && student.join_date) {
          const [year, month] = billingMonth.split("-").map(Number);
          const joined = new Date(student.join_date + "T00:00:00");
          const monthStart = new Date(year, month - 1, 1);
          const monthEnd = new Date(year, month, 0);

          if (joined > monthEnd) {
            amount = 0;
          } else if (
            joined.getFullYear() === year &&
            joined.getMonth() === month - 1
          ) {
            let durationMinutes = 60;

            if (classItem.schedule_start && classItem.schedule_end) {
              const [sh, sm] = classItem.schedule_start.split(":").map(Number);
              const [eh, em] = classItem.schedule_end.split(":").map(Number);
              const startMinutes = sh * 60 + sm;
              const endMinutes = eh * 60 + em;

              if (endMinutes > startMinutes) {
                durationMinutes = endMinutes - startMinutes;
              }
            }

            const feePerLesson = (durationMinutes / 60) * 50000;

            const lessons = lessonsInMonth(
              student.join_date,
              billingMonth,
              classItem.schedule_days
            );

            amount = Math.min(lessons * feePerLesson, monthlyFee);
          } else if (joined < monthStart) {
            amount = monthlyFee;
          }
        }

        if (amount <= 0) continue;

        rows.push({
          student_id: student.id,
          class_id: classItem.id,
          branch_id: classItem.branch_id || null,
          billing_month: billingDate,
          description: `Học phí ${monthLabel(billingMonth)}`,
          amount_due: Math.round(amount),
          amount_paid: 0,
          payment_date: null,
          note: "Tự tạo học phí đầu kỳ",
        });

        existingKeys.add(key);
      }

      if (rows.length === 0) {
        alert(
          `ℹ️ Không có học phí mới cần tạo.\n\nĐã bỏ qua ${skipped} khoản đã tồn tại.`
        );
        return;
      }

      const { error: insertError } = await supabase
        .from("tuition")
        .insert(rows);

      if (insertError) {
        alert("Không tạo được học phí: " + insertError.message);
        return;
      }

      alert(
        `✅ Đã tạo ${rows.length} khoản học phí ${monthLabel(billingMonth)}.\n` +
        `↪️ Bỏ qua ${skipped} khoản đã tồn tại.\n\n` +
        `Không ghi đè các khoản cũ.`
      );

      await loadData();
    } finally {
      setBulkCreating(false);
    }
  }

  async function addTuition(e: React.FormEvent) {
    e.preventDefault();

    if (!studentId) {
      alert("Hãy chọn học viên.");
      return;
    }

    if (!classId) {
      alert("Hãy chọn lớp.");
      return;
    }

    const amount = Number(amountDue);

    if (!amount || amount < 0) {
      alert("Số tiền học phí không hợp lệ.");
      return;
    }

    const classItem = classes.find((c) => c.id === classId);

    if (!classItem) {
      alert("Không tìm thấy lớp.");
      return;
    }

    // Mỗi học viên có thể học nhiều lớp:
    // mỗi LỚP chỉ được tạo 1 kỳ học phí trong 1 tháng.
    const billingDate = `${billingMonth}-01`;

    const existing = tuition.find(
      (t) =>
        t.student_id === studentId &&
        t.class_id === classId &&
        t.billing_month === billingDate
    );

    if (existing) {
      const due = Number(existing.amount_due || 0);
      const paid = Number(existing.amount_paid || 0);
      const remain = Math.max(due - paid, 0);

      if (remain <= 0) {
        alert(
          `🟢 ${studentName(studentId)} đã đóng đủ học phí ${monthLabel(
            billingMonth
          )}.\\nKhông thể thu thêm trong kỳ này.`
        );
      } else {
        alert(
          `⚠️ Học phí ${monthLabel(
            billingMonth
          )} đã tồn tại.\\nCòn nợ: ${money(remain)}.\\nVào danh sách bên dưới để thu phần còn lại.`
        );
      }

      return;
    }

    setSaving(true);

    const branchId = selectedStudent?.branch_id || classItem.branch_id;

    const { error } = await supabase.from("tuition").insert({
      student_id: studentId,
      class_id: classId,
      branch_id: branchId || null,
      billing_month: billingDate,
      description: `Học phí ${monthLabel(billingMonth)}`,
      amount_due: amount,
      amount_paid: 0,
      payment_date: null,
      note: note.trim() || null,
    });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert(`Đã tạo học phí ${money(amount)} cho ${monthLabel(billingMonth)}.`);

    setStudentId("");
    setStudentClassIds([]);
    setClassId("");
    setAmountDue("");
    setNote("");
    setShowForm(false);

    await loadData();
  }

  async function processPayment(
    item: Tuition,
    payment: number,
    paymentMethod: "cash" | "transfer"
  ) {
    const remain = Math.max(
      Number(item.amount_due) - Number(item.amount_paid),
      0
    );

    if (payment <= 0 || payment > remain) {
      alert("Số tiền thanh toán không hợp lệ.");
      return false;
    }

    // Mở cửa sổ ngay trong thao tác xác nhận để trình duyệt không chặn popup.
    const receiptWindow = window.open("", "_blank");

    const { data: paymentData, error: paymentError } = await supabase.rpc(
      "record_tuition_payment_atomic",
      {
        p_tuition_id: item.id,
        p_amount: payment,
        p_payment_method: paymentMethod,
      }
    );

    if (paymentError) {
      if (receiptWindow) receiptWindow.close();
      alert(paymentError.message);
      return false;
    }

    const paymentResult = paymentData as {
      payment_id?: string;
      new_amount_paid?: number | string;
      amount_due?: number | string;
      payment_date?: string;
    } | null;

    const paymentId = paymentResult?.payment_id;
    const newPaid = Number(paymentResult?.new_amount_paid ?? item.amount_paid);
    const amountDue = Number(paymentResult?.amount_due ?? item.amount_due);

    if (!paymentId || !Number.isFinite(newPaid)) {
      if (receiptWindow) receiptWindow.close();
      alert("Máy chủ chưa xác nhận thanh toán học phí thành công.");
      return false;
    }

    if (receiptWindow && paymentId) {
      receiptWindow.location.href =
        `/tuition/receipt/${paymentId}`;
    } else if (paymentId) {
      window.location.href =
        `/tuition/receipt/${paymentId}`;
    }

    alert(
      newPaid >= amountDue
        ? "🟢 Đã thanh toán đủ học phí."
        : `Đã thu ${money(payment)}. Còn lại ${money(
            amountDue - newPaid
          )}.`
    );

    await loadData();

    return true;
  }

  async function deleteTuition(item: Tuition) {
    if (!isAdmin) {
      alert("Chỉ ADMIN mới được xóa học phí.");
      return;
    }

    if (Number(item.amount_paid || 0) > 0) {
      alert("Không thể xóa học phí đã thu tiền.");
      return;
    }

    const ok = window.confirm(
      `Xóa học phí ${money(Number(item.amount_due || 0))} của ${studentName(item.student_id)}?\n\n` +
        "Chỉ xóa khoản học phí này, không xóa học viên, lớp hay dữ liệu khác."
    );

    if (!ok) return;

    const { error } = await supabase.rpc("admin_delete_unpaid_tuition", {
      p_tuition_id: item.id,
    });

    if (error) {
      alert("Không thể xóa học phí: " + error.message);
      return;
    }

    // Cập nhật UI ngay sau khi DB xóa thành công.
    // Các ô Tổng phải thu / Đã thu / Còn nợ được tính từ state tuition,
    // nên loại dòng vừa xóa khỏi state sẽ đồng bộ số liệu ngay lập tức.
    setTuition((current) =>
      current.filter((tuitionItem) => tuitionItem.id !== item.id)
    );

    alert("Đã xóa khoản học phí chưa thu.");

    // Đồng bộ lại lần nữa từ DB để đảm bảo state khớp production.
    await loadData();
  }

  async function markPaid(item: Tuition) {
    const remain = Math.max(
      Number(item.amount_due) - Number(item.amount_paid),
      0
    );

    if (remain <= 0) {
      alert("Học phí này đã thanh toán đủ.");
      return;
    }

    const amount = prompt(
      `Còn phải đóng ${money(remain)}.\nNhập số tiền khách đóng:`,
      String(remain)
    );

    if (amount === null) return;

    const payment = Number(amount);

    if (!payment || payment <= 0) {
      alert("Số tiền không hợp lệ.");
      return;
    }

    if (payment > remain) {
      alert("Số tiền đóng không được lớn hơn số tiền còn lại.");
      return;
    }

    const method = window.prompt(
      "Chọn phương thức thanh toán:\n\n1 = 💵 Tiền mặt\n2 = 🏦 Chuyển khoản",
      "1"
    );

    if (method === null) return;

    let paymentMethod: "cash" | "transfer";

    if (method.trim() === "1") {
      paymentMethod = "cash";
    } else if (method.trim() === "2") {
      paymentMethod = "transfer";
    } else {
      alert("Vui lòng chọn 1 hoặc 2.");
      return;
    }

    await processPayment(item, payment, paymentMethod);
  }

  async function confirmVoicePayment() {
    if (!voicePayment) return;

    const { item, amount, method } = voicePayment;

    setVoicePayment(null);

    await processPayment(item, amount, method);
  }

  function studentName(id: string) {
    return students.find((s) => s.id === id)?.full_name ?? "Không rõ";
  }

  function className(id: string | null) {
    return classes.find((c) => c.id === id)?.name ?? "Chưa chọn lớp";
  }

  function branchName(id: string | null) {
    return branches.find((b) => b.id === id)?.name ?? "Chưa gán cơ sở";
  }

  function paymentsForTuition(tuitionId: string) {
    return payments.filter((payment) => payment.tuition_id === tuitionId);
  }

  const filteredTuition = tuition.filter((item) => {
    // Chỉ tính học phí của tháng đang xem.
    if (item.billing_month !== `${billingMonth.slice(0, 7)}-01`) {
      return false;
    }

    const q = search.trim().toLowerCase();

    if (!q) return true;

    return (
      studentName(item.student_id).toLowerCase().includes(q) ||
      className(item.class_id).toLowerCase().includes(q) ||
      branchName(item.branch_id).toLowerCase().includes(q)
    );
  });

  // filteredTuition đã được giới hạn theo đúng tháng đang xem.
  const totalDue = filteredTuition.reduce(
    (sum, item) => sum + Number(item.amount_due),
    0
  );

  const totalPaid = filteredTuition.reduce(
    (sum, item) => sum + Number(item.amount_paid),
    0
  );

  const totalRemain = Math.max(totalDue - totalPaid, 0);


  const filteredStudents = students
    .filter((student) =>
      student.full_name
        .toLowerCase()
        .includes(studentSearch.trim().toLowerCase())
    )
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-blue-600">
            QUẢN LÝ TÀI CHÍNH
          </div>
          <h1 className="mt-1 text-4xl font-black tracking-tight">
            💰 Học phí
          </h1>
          <p className="mt-2 text-slate-400">
            Thu học phí theo kỳ ngày 1 hàng tháng
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="ui-btn ui-btn-primary"
            onClick={createMonthlyTuition}
            disabled={bulkCreating}
          >
            {bulkCreating
              ? "⏳ Đang tạo..."
              : `📅 Tạo học phí ${monthLabel(billingMonth)}`}
          </button>

          <button
            className="ui-btn ui-btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Đóng" : "+ Tạo học phí"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">TỔNG PHẢI THU</div>
          <div className="mt-2 text-3xl font-black">{money(totalDue)}</div>
        </div>

        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">ĐÃ THU</div>
          <div className="mt-2 text-3xl font-black text-emerald-600">
            {money(totalPaid)}
          </div>
        </div>

        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">CÒN NỢ</div>
          <div className="mt-2 text-3xl font-black text-rose-500">
            {money(totalRemain)}
          </div>
        </div>
      </section>

      {showForm && (
        <section className="ui-card p-6 sm:p-8">
          <div className="mb-6">
            <div className="text-xs font-black uppercase tracking-widest text-blue-600">
              TẠO KỲ HỌC PHÍ
            </div>
            <h2 className="mt-1 text-2xl font-black">
              Học phí thu ngày 1
            </h2>
          </div>

          <form
            onSubmit={addTuition}
            className="grid gap-5 md:grid-cols-2"
          >
            <label className="block">
              <div className="mb-2 text-sm font-bold">Học viên</div>
              <div className="relative">
                <input
                  className="ui-input"
                  placeholder="🔎 Gõ tên học viên..."
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setStudentId("");
                    setShowStudentSearch(true);
                  }}
                  onFocus={() => setShowStudentSearch(true)}
                  onBlur={() =>
                    setTimeout(() => setShowStudentSearch(false), 150)
                  }
                />

                {showStudentSearch && studentSearch.trim() && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
                    {filteredStudents.length === 0 ? (
                      <div className="p-3 text-sm text-slate-400">
                        Không tìm thấy học viên
                      </div>
                    ) : (
                      filteredStudents.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={async () => {
                            setStudentId(student.id);
                            setStudentSearch(student.full_name);
                            setShowStudentSearch(false);
                              setClassId("");
                              setAmountDue("");

                              // Nạp đúng các lớp mà học viên đang được gán
                              const { data: memberships, error: membershipError } =
                                await supabase
                                  .from("class_students")
                                  .select("class_id")
                                  .eq("student_id", student.id);

                              if (membershipError) {
                                alert(
                                  "Không lấy được lớp của học viên: " +
                                    membershipError.message
                                );
                                setStudentClassIds([]);
                                return;
                              }

                              const classIds = (memberships || [])
                                .map((m) => m.class_id)
                                .filter(Boolean);

                              setStudentClassIds(classIds);

                              const assignedClasses = classes.filter((c) =>
                                classIds.includes(c.id)
                              );


                          }}
                        >
                          <div className="font-semibold">
                            {student.full_name}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold">Lớp</div>
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  const selected = classes.find(
                    (c) => c.id === e.target.value
                  );
                  if (selected) calculateAmount(selected);
                }}
                className="ui-input"
              >
                <option value="">-- Chọn lớp --</option>
                {studentClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {money(Number(item.monthly_fee))}/tháng
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold">
                Kỳ học phí
              </div>
              <input
                type="month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                className="ui-input"
              />
              <div className="mt-2 text-xs text-slate-400">
                Kỳ thu luôn bắt đầu ngày 1
              </div>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold">
                Số tiền phải thu
              </div>
              <input
                type="number"
                min="0"
                step="1000"
                value={amountDue}
                onChange={(e) => setAmountDue(e.target.value)}
                className="ui-input"
              />
            </label>

            {selectedStudent && classId && (
              <div className="rounded-3xl bg-blue-50 p-5 md:col-span-2">
                <div className="font-black text-blue-900">
                  🧮 Tính tự động
                </div>

                <div className="mt-2 text-sm text-blue-800">
                  Ngày vào học:{" "}
                  <b>
                    {selectedStudent.join_date
                      ? new Date(
                          selectedStudent.join_date + "T00:00:00"
                        ).toLocaleDateString("vi-VN")
                      : "Chưa cập nhật"}
                  </b>
                </div>

                <div className="mt-1 text-sm text-blue-800">
                  Học phí kỳ {monthLabel(billingMonth)}:{" "}
                  <b>{money(Number(amountDue || 0))}</b>
                </div>
              </div>
            )}

            <label className="block md:col-span-2">
              <div className="mb-2 text-sm font-bold">Ghi chú</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Ví dụ: tháng đầu vào học giữa tháng..."
                className="ui-input"
              />
            </label>

            <div className="flex justify-end md:col-span-2">
              <button
                className="ui-btn ui-btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "Đang lưu..." : "💾 Lưu học phí"}
              </button>
            </div>
          </form>
        </section>
      )}


      <section className="ui-card p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-blue-600">
              QUẢN LÝ HỌC PHÍ THEO LỚP
            </div>
            <h2 className="mt-1 text-2xl font-black">
              🏫 Chọn lớp để thu học phí
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {monthLabel(billingMonth)} · Mỗi học viên chỉ có một khoản học phí cho mỗi lớp/kỳ.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-slate-500">
              Kỳ:
            </label>
            <input
              type="month"
              value={billingMonth}
              onChange={(e) => {
                setBillingMonth(e.target.value);
                setSelectedTuitionClassId("");
              }}
              className="ui-input w-auto"
            />
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {branches.map((branch) => {
            const branchClasses = activeClasses.filter(
              (item) => item.branch_id === branch.id
            );

            if (!branchClasses.length) return null;

            return (
              <div key={branch.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">🏢</span>
                  <h3 className="font-black">{branch.name}</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {branchClasses.map((item) => {
                    const stats = classStats(item.id);
                    const selected = selectedTuitionClassId === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          const nextId = selected ? "" : item.id;
                          setSelectedTuitionClassId(nextId);

                          if (nextId) {
                            setTimeout(() => {
                              document
                                .getElementById("tuition-student-list")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                            }, 150);
                          }
                        }}
                        className={`rounded-3xl border p-5 text-left transition ${
                          selected
                            ? "border-blue-500 bg-blue-50 shadow-lg"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-md"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-black text-slate-800">
                              💃 {item.name}
                            </div>
                            <div className="mt-1 text-sm text-slate-400">
                              {money(Number(item.monthly_fee))}/tháng
                            </div>
                          </div>

                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                            {stats.total} HV
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-2xl bg-emerald-50 p-3">
                            <div className="text-slate-400">Đã đóng</div>
                            <div className="mt-1 font-black text-emerald-600">
                              {stats.paid}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-rose-50 p-3">
                            <div className="text-slate-400">Còn nợ</div>
                            <div className="mt-1 font-black text-rose-500">
                              {stats.debt}
                            </div>
                          </div>
                        </div>

                        {stats.debtAmount > 0 && (
                          <div className="mt-3 text-xs font-bold text-rose-500">
                            Còn nợ: {money(stats.debtAmount)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>


      {voicePayment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-widest text-blue-600">
              XÁC NHẬN THU HỌC PHÍ BẰNG GIỌNG NÓI
            </div>

            <h2 className="mt-2 text-2xl font-black">
              💰 Xác nhận giao dịch
            </h2>

            <div className="mt-5 space-y-3 rounded-3xl bg-slate-50 p-5">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Học viên</span>
                <b className="text-right">
                  {studentName(voicePayment.item.student_id)}
                </b>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Lớp</span>
                <b className="text-right">
                  {selectedTuitionClass?.name ?? "Không rõ"}
                </b>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Kỳ</span>
                <b>{monthLabel(billingMonth)}</b>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Số tiền</span>
                <b className="text-xl text-emerald-600">
                  {money(voicePayment.amount)}
                </b>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Thanh toán</span>
                <b>
                  {voicePayment.method === "transfer"
                    ? "🏦 Chuyển khoản"
                    : "💵 Tiền mặt"}
                </b>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
              🎙️ Bạn nói: <b>“{voicePayment.transcript}”</b>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="ui-btn"
                onClick={() => setVoicePayment(null)}
              >
                Hủy
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-primary"
                onClick={confirmVoicePayment}
              >
                ✅ Xác nhận thu tiền
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTuitionClass && (
        <section
          id="tuition-student-list"
          className="ui-card scroll-mt-24 overflow-hidden"
        >
          <div className="border-b border-slate-100 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-blue-600">
                  DANH SÁCH HỌC VIÊN
                </div>
                <h2 className="mt-1 text-2xl font-black">
                  💃 {selectedTuitionClass.name}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {monthLabel(billingMonth)} ·{" "}
                  {selectedClassStudents.length} học viên
                </p>
              </div>

              <div className="flex w-full gap-2 lg:w-auto">
                <input
                  value={classStudentSearch}
                  onChange={(e) => setClassStudentSearch(e.target.value)}
                  placeholder="🔎 Tìm học viên..."
                  className="ui-input lg:w-72"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startVoiceSearch}
                    className={`ui-btn whitespace-nowrap ${
                      isListening
                        ? "bg-rose-500 text-white"
                        : "ui-btn-primary"
                    }`}
                    title="Nói tên học viên để tìm"
                  >
                    {isListening ? "🔴 Đang nghe..." : "🎙️ Nói tên"}
                  </button>

                  <button
                    type="button"
                    onClick={startVoicePayment}
                    className={`ui-btn whitespace-nowrap ${
                      voicePaymentListening
                        ? "bg-rose-500 text-white"
                        : "ui-btn-primary"
                    }`}
                    title="Nói câu lệnh thu học phí"
                  >
                    {voicePaymentListening
                      ? "🔴 Đang nghe..."
                      : "💰🎙️ Nói để thu"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {selectedClassStudents.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              Không tìm thấy học viên trong lớp.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {selectedClassStudents.map((student) => {
                const item = tuitionForStudentClass(
                  student.id,
                  selectedTuitionClass.id
                );

                const due = Number(item?.amount_due || 0);
                const paid = Number(item?.amount_paid || 0);
                const remain = Math.max(due - paid, 0);
                const fullyPaid = !!item && remain <= 0 && due > 0;

                return (
                  <div
                    key={student.id}
                    className="grid gap-4 p-5 lg:grid-cols-[minmax(280px,1fr)_430px_170px] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="font-black text-slate-800">
                        {student.full_name}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {item
                          ? `Kỳ ${monthLabel(billingMonth)}`
                          : "Chưa tạo học phí"}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-6 text-sm">
                      <div>
                        <div className="text-xs text-slate-400">Phải thu</div>
                        <div className="mt-1 font-black">
                          {money(due)}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-slate-400">Đã thu</div>
                        <div className="mt-1 font-black text-emerald-600">
                          {money(paid)}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-slate-400">Còn lại</div>
                        <div className="mt-1 font-black text-rose-500">
                          {money(remain)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {fullyPaid ? (
                        <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-700">
                          🟢 Đã đóng
                        </span>
                      ) : item ? (
                        <button
                          type="button"
                          onClick={() => markPaid(item)}
                          className="ui-btn ui-btn-primary"
                        >
                          💰 Thu tiền
                        </button>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-700">
                          🟡 Chưa tạo
                        </span>
                      )}

                      {item && isAdmin && Number(item.amount_paid || 0) === 0 && (
                        <button
                          type="button"
                          className="ui-btn whitespace-nowrap"
                          onClick={() => deleteTuition(item)}
                        >
                          🗑️ Xóa
                        </button>
                      )}

                      {item &&
                        paymentsForTuition(item.id).map((payment) => (
                          <button
                            key={payment.id}
                            type="button"
                            className="ui-btn whitespace-nowrap"
                            onClick={() =>
                              window.open(
                                `/tuition/receipt/${payment.id}`,
                                "_blank"
                              )
                            }
                            title={`Mở phiếu thu ${payment.receipt_no || payment.id}`}
                          >
                            🧾 In phiếu thu
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="ui-card overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black">📋 Danh sách học phí</h2>
              <p className="mt-1 text-sm text-slate-400">
                {filteredTuition.length} khoản học phí
              </p>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔎 Tìm học viên, lớp..."
              className="ui-input md:max-w-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            Đang tải dữ liệu...
          </div>
        ) : filteredTuition.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            Chưa có học phí.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-left text-sm text-slate-400">
                  <th className="p-4">Học viên</th>
                  <th className="p-4">Lớp</th>
                  <th className="p-4">Kỳ</th>
                  <th className="p-4">Cơ sở</th>
                  <th className="p-4 text-right">Phải thu</th>
                  <th className="p-4 text-right">Đã thu</th>
                  <th className="p-4 text-right">Còn lại</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4"></th>
                </tr>
              </thead>

              <tbody>
                {filteredTuition.map((item) => {
                  const remain = Math.max(
                    Number(item.amount_due) -
                      Number(item.amount_paid),
                    0
                  );

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-50"
                    >
                      <td className="p-4 font-bold">
                        {studentName(item.student_id)}
                      </td>

                      <td className="p-4">
                        {className(item.class_id)}
                      </td>

                      <td className="p-4">
                        {item.billing_month?.slice(0, 7)}
                      </td>

                      <td className="p-4">
                        {branchName(item.branch_id)}
                      </td>

                      <td className="p-4 text-right font-bold">
                        {money(Number(item.amount_due))}
                      </td>

                      <td className="p-4 text-right text-emerald-600">
                        {money(Number(item.amount_paid))}
                      </td>

                      <td className="p-4 text-right font-black">
                        {money(remain)}
                      </td>

                      <td className="p-4">
                        {remain === 0 ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                            🟢 Đã đóng
                          </span>
                        ) : Number(item.amount_paid) > 0 ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
                            🟡 Một phần
                          </span>
                        ) : (
                          <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700">
                            🔴 Chưa đóng
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          {remain > 0 && (
                            <button
                              className="ui-btn ui-btn-blue whitespace-nowrap"
                              onClick={() => markPaid(item)}
                            >
                              💰 Thu tiền
                            </button>
                          )}

                          {item && isAdmin && Number(item.amount_paid || 0) === 0 && (
                            <button
                              type="button"
                              className="ui-btn whitespace-nowrap"
                              onClick={() => deleteTuition(item)}
                            >
                              🗑️ Xóa
                            </button>
                          )}

                          {paymentsForTuition(item.id).map((payment) => (
                            <button
                              key={payment.id}
                              type="button"
                              className="ui-btn whitespace-nowrap"
                              onClick={() => {
                                window.open(
                                  `/tuition/receipt/${payment.id}`,
                                  "_blank"
                                );
                              }}
                              title={`Mở phiếu thu ${payment.receipt_no || payment.id}`}
                            >
                              🧾 Phiếu thu
                              {paymentsForTuition(item.id).length > 1
                                ? ` #${payment.receipt_no || payment.id.slice(0, 6)}`
                                : ""}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
