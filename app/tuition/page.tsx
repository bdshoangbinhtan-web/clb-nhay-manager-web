/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamCurrentMonth } from "@/lib/vietnam-date";
import { useRealtimeRefresh } from "@/components/realtime/global-realtime-provider";
import {
  applyTuitionAdjustments,
  determineActiveClasses,
  getFirstUnpaidMonth,
  getMembershipTuitionStatus,
  monthKey,
  periodDate,
  type TuitionMembership,
} from "@/lib/tuition/due-status";

type Student = {
  id: string;
  student_code: string;
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
  effective_amount_due?: number;
  effective_amount_paid?: number;
  payment_date: string | null;
  note: string | null;
  status: string;
};

type ClassMembership = TuitionMembership;

type TuitionPayment = {
  id: string;
  tuition_id: string;
  amount: number;
  payment_method: "cash" | "transfer" | string | null;
  payment_date: string | null;
  receipt_no: string | null;
};

type TuitionAdjustment = {
  id: string;
  tuition_id: string;
  target_tuition_id: string | null;
  action: string;
  amount: number;
};


type VoicePayment = {
  item: Tuition;
  amount: number;
  method: "cash" | "transfer";
  transcript: string;
};

const TUITION_PER_BATCH = 80;

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

function suggestedTuitionAmount(
  student: Student,
  classItem: ClassItem,
  billingMonth: string,
  enrollmentStartDate: string | null = null
) {
  const effectiveJoinDate = [student.join_date, enrollmentStartDate]
    .filter((value): value is string => !!value)
    .sort()
    .at(-1) ?? null;
  const lessons = lessonsInMonth(
    effectiveJoinDate,
    billingMonth,
    classItem.schedule_days
  );
  const startMinutes = classItem.schedule_start
    ? Number(classItem.schedule_start.slice(0, 2)) * 60 +
      Number(classItem.schedule_start.slice(3, 5))
    : 0;
  const endMinutes = classItem.schedule_end
    ? Number(classItem.schedule_end.slice(0, 2)) * 60 +
      Number(classItem.schedule_end.slice(3, 5))
    : 0;
  const durationMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : 60;
  const feePerLesson = (durationMinutes / 60) * 50000;

  if (!effectiveJoinDate) return Number(classItem.monthly_fee);

  const [year, month] = billingMonth.split("-").map(Number);
  const joined = new Date(effectiveJoinDate + "T00:00:00");
  if (joined.getFullYear() === year && joined.getMonth() === month - 1) {
    return Math.round(Math.min(lessons * feePerLesson, Number(classItem.monthly_fee)));
  }
  if (joined < new Date(year, month - 1, 1)) return Number(classItem.monthly_fee);
  return 0;
}

export default function TuitionPage() {
  const supabase = useMemo(() => createClient(), []);
  const loadRequestRef = useRef(0);
  const newStudentPrefillRef = useRef(false);
  const urlContextAppliedRef = useRef(false);

  const [isAdmin, setIsAdmin] = useState(false);

  const [tuition, setTuition] = useState<Tuition[]>([]);
  const [payments, setPayments] = useState<TuitionPayment[]>([]);
  const [tuitionAdjustments, setTuitionAdjustments] = useState<TuitionAdjustment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isNewStudentFlow, setIsNewStudentFlow] = useState(false);

  const [search, setSearch] = useState("");
  const [focusedStudentId, setFocusedStudentId] = useState("");
  const [visibleTuitionCount, setVisibleTuitionCount] = useState(
    TUITION_PER_BATCH
  );
  const [billingMonth, setBillingMonth] = useState(
    vietnamCurrentMonth()
  );

  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [showStudentSearch, setShowStudentSearch] = useState(false);
  const [classId, setClassId] = useState("");
  const [studentClassIds, setStudentClassIds] = useState<string[]>([]);
  const [amountDue, setAmountDue] = useState("");
  const [amountToCollect, setAmountToCollect] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [collectionMonth, setCollectionMonth] = useState(vietnamCurrentMonth());
  const [manualPeriod, setManualPeriod] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [voicePayment, setVoicePayment] = useState<VoicePayment | null>(null);
  const [voicePaymentListening, setVoicePaymentListening] = useState(false);
  const [classMemberships, setClassMemberships] = useState<ClassMembership[]>([]);
  const [selectedTuitionClassId, setSelectedTuitionClassId] = useState("");
  const [classStudentSearch, setClassStudentSearch] = useState("");
  const [isListening, setIsListening] = useState(false);
  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();

    if (requestId !== loadRequestRef.current) return;

    if (authData.user) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (requestId !== loadRequestRef.current) return;

      setIsAdmin(profileData?.role === "admin");
    }

    const [
      studentResult,
      branchResult,
      classResult,
      membershipResult,
      adjustmentResult,
    ] = await Promise.all([
      supabase
        .from("students")
        .select("id,student_code,full_name,branch_id,join_date,status")
        .order("full_name"),
      supabase.from("branches").select("id,name").order("name"),
      supabase
        .from("classes")
        .select("id,name,branch_id,monthly_fee,status,schedule_days,schedule_start,schedule_end")
        .order("name"),
      supabase
        .from("class_students")
        .select("student_id,class_id,status,start_date,end_date")
        .eq("status", "active"),
      supabase
        .from("tuition_adjustments")
        .select("id,tuition_id,target_tuition_id,action,amount"),
    ]);

    if (requestId !== loadRequestRef.current) return;

    const tuitionRows: Tuition[] = [];
    let tuitionOffset = 0;
    let tuitionError: string | null = null;
    while (true) {
      const result = await supabase
        .from("tuition")
        .select("id,student_id,class_id,branch_id,billing_month,description,amount_due,amount_paid,payment_date,note,status")
        .order("billing_month", { ascending: false })
        .order("id", { ascending: true })
        .range(tuitionOffset, tuitionOffset + 499);
      if (result.error) {
        tuitionError = result.error.message;
        break;
      }
      const batch = (result.data ?? []) as Tuition[];
      tuitionRows.push(...batch);
      if (batch.length < 500) break;
      tuitionOffset += 500;
    }

    const [
      { data: studentData, error: studentError },
      { data: branchData, error: branchError },
      { data: classData, error: classError },
      { data: membershipData, error: membershipError },
      { data: adjustmentData, error: adjustmentError },
    ] = [
      studentResult,
      branchResult,
      classResult,
      membershipResult,
      adjustmentResult,
    ];

    if (requestId !== loadRequestRef.current) return;

    if (tuitionError) {
      alert(tuitionError);
      setLoading(false);
      return;
    }

    if (studentError) {
      alert(studentError.message);
      setLoading(false);
      return;
    }

    if (branchError) {
      alert(branchError.message);
      setLoading(false);
      return;
    }

    if (classError) {
      alert(classError.message);
      setLoading(false);
      return;
    }

    if (membershipError) {
      alert(membershipError.message);
      setLoading(false);
      return;
    }

    if (adjustmentError) {
      alert(adjustmentError.message);
      setLoading(false);
      return;
    }

    const tuitionIds = tuitionRows.map((item) => item.id);
    let paymentData: TuitionPayment[] = [];

    if (tuitionIds.length > 0) {
      const chunks: string[][] = [];

      for (let index = 0; index < tuitionIds.length; index += 200) {
        chunks.push(tuitionIds.slice(index, index + 200));
      }

      const paymentResults = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from("tuition_payments")
            .select(
              "id,tuition_id,amount,payment_method,payment_date,receipt_no"
            )
            .in("tuition_id", ids)
            .order("payment_date", { ascending: false })
        )
      );

      if (requestId !== loadRequestRef.current) return;

      const paymentError = paymentResults.find(
        (result) => result.error
      )?.error;

      if (paymentError) {
        alert(paymentError.message);
        setLoading(false);
        return;
      }

      paymentData = paymentResults.flatMap(
        (result) => (result.data ?? []) as TuitionPayment[]
      );
    }

    setTuition(tuitionRows);
    setPayments(paymentData ?? []);
    setTuitionAdjustments((adjustmentData ?? []) as TuitionAdjustment[]);
    setStudents(studentData ?? []);
    setBranches(branchData ?? []);
    setClasses(classData ?? []);
    setClassMemberships(membershipData ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useRealtimeRefresh(["tuition"], loadData);

  useEffect(() => {
    if (urlContextAppliedRef.current) return;
    urlContextAppliedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const requestedStudentId = params.get("studentId") ?? "";
    const requestedMonth = params.get("month") ?? "";

    if (requestedStudentId) setFocusedStudentId(requestedStudentId);
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) {
      setBillingMonth(requestedMonth);
    }
  }, []);

  const studentById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );

  const classById = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes]
  );

  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches]
  );

  const selectedStudent = studentById.get(studentId);
  const focusedStudent = focusedStudentId
    ? studentById.get(focusedStudentId)
    : undefined;

  useEffect(() => {
    if (loading || !focusedStudent) return;
    window.setTimeout(() => {
      document.getElementById("tuition-list")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }, [focusedStudent, loading]);

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

  const currentMonth = vietnamCurrentMonth();

  const tuitionForDueStatus = useMemo(() => {
    return applyTuitionAdjustments(tuition, payments, tuitionAdjustments);
  }, [payments, tuition, tuitionAdjustments]);

  const membershipTuitionRows = useMemo(() => {
    const rows: Array<{
      membership: ClassMembership;
      student: Student;
      classItem: ClassItem;
      due: ReturnType<typeof getMembershipTuitionStatus>;
      suggestedAmount: number;
    }> = [];

    for (const membership of activeMemberships) {
      const student = studentById.get(membership.student_id);
      const classItem = classById.get(membership.class_id);
      if (!student || !classItem) continue;
      const due = getMembershipTuitionStatus(
        membership,
        student.status,
        classItem.status,
        tuitionForDueStatus,
        currentMonth
      );
      if (due.status === "INACTIVE") continue;
      const record = tuitionForDueStatus.find(
        (item) =>
          item.student_id === student.id &&
          item.class_id === classItem.id &&
          monthKey(item.billing_month) === due.firstUnpaidMonth
      );
      rows.push({
        membership,
        student,
        classItem,
        due,
        suggestedAmount:
          record?.effective_amount_due ?? record?.amount_due ??
          (due.firstUnpaidMonth
            ? suggestedTuitionAmount(student, classItem, due.firstUnpaidMonth, membership.start_date)
            : Number(classItem.monthly_fee)),
      });
    }

    return rows.sort((a, b) => {
      const aMonth = a.due.firstUnpaidMonth ?? "9999-12";
      const bMonth = b.due.firstUnpaidMonth ?? "9999-12";
      return aMonth.localeCompare(bMonth) || a.student.full_name.localeCompare(b.student.full_name, "vi");
    });
  }, [activeMemberships, classById, currentMonth, studentById, tuitionForDueStatus]);

  const actionableDueRows = useMemo(
    () => membershipTuitionRows.filter((row) =>
      ["DUE", "OVERDUE", "PARTIAL"].includes(row.due.status) &&
      (row.due.remaining > 0 || row.suggestedAmount > 0)
    ),
    [membershipTuitionRows]
  );

  const dueCount = actionableDueRows.filter(
    (row) => row.due.firstUnpaidMonth === currentMonth
  ).length;
  const overdueCount = actionableDueRows.filter(
    (row) => !!row.due.firstUnpaidMonth && row.due.firstUnpaidMonth < currentMonth
  ).length;
  const collectedThisMonth = useMemo(
    () => payments
      .filter((payment) => monthKey(payment.payment_date) === currentMonth)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    [currentMonth, payments]
  );

  useEffect(() => {
    if (!studentId) return;
    const { classes: assigned, autoSelectedClassId } = determineActiveClasses(
      studentId,
      classes.filter((item) => item.status === "active"),
      activeMemberships
    );
    setStudentClassIds(assigned.map((item) => item.id));
    if (assigned.length === 1) {
      setClassId(autoSelectedClassId);
    } else if (!assigned.some((item) => item.id === classId)) {
      setClassId("");
    }
  }, [activeMemberships, classes, classId, studentId]);

  useEffect(() => {
    if (!selectedStudent || !classId) return;
    const membership = activeMemberships.find(
      (item) => item.student_id === selectedStudent.id && item.class_id === classId
    );
    const period = manualPeriod
      ? collectionMonth
      : getFirstUnpaidMonth(
          membership ?? {
            student_id: selectedStudent.id,
            class_id: classId,
            status: "active",
            start_date: null,
            end_date: null,
          },
          tuitionForDueStatus,
          currentMonth
        );
    if (!manualPeriod && collectionMonth !== period) setCollectionMonth(period);
    const classItem = classById.get(classId);
    if (!classItem) return;
    const existing = tuition.find(
      (item) =>
        item.student_id === selectedStudent.id &&
        item.class_id === classId &&
        monthKey(item.billing_month) === period
    );
    const effectiveExisting = existing
      ? tuitionForDueStatus.find((item) => item.id === existing.id)
      : undefined;
    const suggested = Number(
      existing?.amount_due ?? suggestedTuitionAmount(selectedStudent, classItem, period, membership?.start_date ?? null)
    );
    const remaining = existing
      ? Math.max(
          Number(effectiveExisting?.effective_amount_due ?? existing.amount_due) -
            Number(effectiveExisting?.effective_amount_paid ?? existing.amount_paid),
          0
        )
      : suggested;
    setAmountDue(String(suggested));
    setAmountToCollect(String(remaining));
  }, [
    activeMemberships,
    classById,
    classId,
    collectionMonth,
    currentMonth,
    manualPeriod,
    selectedStudent,
    tuition,
    tuitionForDueStatus,
  ]);

  const activeStudentIdsByClass = useMemo(() => {
    const result = new Map<string, string[]>();

    for (const membership of activeMemberships) {
      const ids = result.get(membership.class_id) ?? [];
      ids.push(membership.student_id);
      result.set(membership.class_id, ids);
    }

    return result;
  }, [activeMemberships]);

  const tuitionByStudentClass = useMemo(() => {
    const result = new Map<string, Tuition>();
    for (const item of tuition) {
      if (!item.class_id || monthKey(item.billing_month) !== billingMonth) continue;
      result.set(`${item.student_id}__${item.class_id}`, item);
    }

    return result;
  }, [tuition, billingMonth]);

  const paymentsByTuition = useMemo(() => {
    const result = new Map<string, TuitionPayment[]>();

    for (const payment of payments) {
      const items = result.get(payment.tuition_id) ?? [];
      items.push(payment);
      result.set(payment.tuition_id, items);
    }

    return result;
  }, [payments]);

  const selectedTuitionClass = selectedTuitionClassId
    ? classById.get(selectedTuitionClassId)
    : undefined;

  const selectedClassStudents = useMemo(() => {
    if (!selectedTuitionClassId) return [];

    const ids = new Set(
      activeStudentIdsByClass.get(selectedTuitionClassId) ?? []
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

        const searchable = `${student.student_code} ${student.full_name}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "");

        return searchable.includes(q);
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"));
  }, [
    selectedTuitionClassId,
    activeStudentIdsByClass,
    students,
    classStudentSearch,
  ]);

  function tuitionForStudentClass(studentId: string, classId: string) {
    return tuitionByStudentClass.get(`${studentId}__${classId}`);
  }

  const classStatsById = useMemo(() => {
    const result = new Map<
      string,
      { total: number; paid: number; debt: number; debtAmount: number }
    >();

    for (const classItem of activeClasses) {
      const studentIds = activeStudentIdsByClass.get(classItem.id) ?? [];
      let paid = 0;
      let debt = 0;
      let debtAmount = 0;

      for (const studentId of studentIds) {
        const item = tuitionByStudentClass.get(
          `${studentId}__${classItem.id}`
        );

        if (!item) continue;

        const amountDue = Number(item.amount_due);
        const amountPaid = Number(item.amount_paid);

        if (amountDue > 0 && amountPaid >= amountDue) {
          paid++;
        }

        if (amountDue > amountPaid) {
          debt++;
          debtAmount += Math.max(amountDue - amountPaid, 0);
        }
      }

      result.set(classItem.id, {
        total: studentIds.length,
        paid,
        debt,
        debtAmount,
      });
    }

    return result;
  }, [activeClasses, activeStudentIdsByClass, tuitionByStudentClass]);

  function classStats(classId: string) {
    return (
      classStatsById.get(classId) ?? {
        total: 0,
        paid: 0,
        debt: 0,
        debtAmount: 0,
      }
    );
  }

  function startVoiceSearch() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
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

  useEffect(() => {
    if (loading || newStudentPrefillRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const newStudentId = params.get("newStudentId");

    if (!newStudentId) return;

    const student = students.find((item) => item.id === newStudentId);
    if (!student) return;

    const assignedClassIds = activeMemberships
      .filter((membership) => membership.student_id === newStudentId)
      .map((membership) => membership.class_id);
    const requestedClassId = params.get("classId");
    const requestedBillingMonth = params.get("billingMonth");
    const initialClassId =
      requestedClassId && assignedClassIds.includes(requestedClassId)
        ? requestedClassId
        : assignedClassIds.length === 1 ? assignedClassIds[0] : "";

    newStudentPrefillRef.current = true;
    setStudentId(student.id);
    setStudentSearch(student.full_name);
    setStudentClassIds(assignedClassIds);
    setClassId(initialClassId);
    setNote("");
    setShowForm(true);
    setIsNewStudentFlow(true);

    if (requestedBillingMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedBillingMonth)) {
      setCollectionMonth(requestedBillingMonth);
      setManualPeriod(false);
    }

    window.history.replaceState({}, "", "/tuition");

    window.setTimeout(() => {
      document
        .getElementById("create-tuition-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [
    activeMemberships,
    loading,
    students,
  ]);


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

    const dueAmount = Number(amountDue);
    const amount = Number(amountToCollect);

    if (!Number.isFinite(dueAmount) || dueAmount < 0 || !Number.isFinite(amount) || amount <= 0) {
      alert("Số tiền học phí hoặc số tiền thực thu không hợp lệ.");
      return;
    }

    const classItem = classes.find((c) => c.id === classId);
    const membership = activeMemberships.find(
      (item) => item.student_id === studentId && item.class_id === classId
    );

    if (!classItem || !membership || selectedStudent?.status !== "active") {
      alert("Học viên hiện không có lớp đang học.");
      return;
    }

    const existing = tuition.find(
      (item) =>
        item.student_id === studentId &&
        item.class_id === classId &&
        monthKey(item.billing_month) === collectionMonth
    );
    const expectedAmount = existing
      ? Number(existing.amount_due)
      : suggestedTuitionAmount(selectedStudent, classItem, collectionMonth, membership.start_date);
    const noteParts = [note.trim()];
    if (manualPeriod) noteParts.push(`Kỳ được chọn thủ công: ${collectionMonth}`);
    if (Math.abs(dueAmount - expectedAmount) > 0.01) {
      noteParts.push(`Điều chỉnh số học phí thủ công: đề xuất ${expectedAmount}, áp dụng ${dueAmount}`);
    }

    if (amount > dueAmount) {
      alert("Số tiền thực thu không được lớn hơn số học phí của kỳ.");
      return;
    }

    setSaving(true);
    const receiptWindow = window.open("", "_blank");
    const { data, error } = await supabase.rpc("collect_tuition_payment_atomic", {
      p_student_id: studentId,
      p_class_id: classId,
      p_billing_month: periodDate(collectionMonth),
      p_amount_due: dueAmount,
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_payment_date: null,
      p_note: noteParts.filter(Boolean).join(" · ") || null,
    });

    setSaving(false);

    if (error) {
      if (receiptWindow) receiptWindow.close();
      alert(error.message);
      return;
    }

    const result = data as {
      success?: boolean;
      payment_result?: { payment_id?: string };
      remaining_amount?: number | string;
    } | null;
    if (!result?.success) {
      if (receiptWindow) receiptWindow.close();
      alert("Máy chủ chưa xác nhận đã thu học phí.");
      return;
    }

    alert(
      Number(result.remaining_amount || 0) <= 0
        ? "Đã thu học phí thành công."
        : `Đã thu ${money(amount)}. Còn thiếu ${money(Number(result.remaining_amount))}.`
    );

    const paymentId = result.payment_result?.payment_id;
    setShowForm(false);
    setIsNewStudentFlow(false);
    setStudentId("");
    setStudentSearch("");
    setStudentClassIds([]);
    setClassId("");
    setAmountDue("");
    setAmountToCollect("");
    setNote("");
    await loadData();
    if (paymentId && receiptWindow) {
      receiptWindow.location.href = `/tuition/receipt/${paymentId}`;
    } else if (paymentId) {
      window.location.href = `/tuition/receipt/${paymentId}`;
    }
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

  function openCollectionForTuition(
    item: Tuition,
    amountOverride?: number,
    method: "cash" | "transfer" = "cash"
  ) {
    const student = studentById.get(item.student_id);
    const classItem = item.class_id ? classById.get(item.class_id) : undefined;
    const membership = activeMemberships.find(
      (entry) => entry.student_id === item.student_id && entry.class_id === item.class_id
    );
    const period = monthKey(item.billing_month);
    if (!student || !classItem || !membership || !period || student.status !== "active" || classItem.status !== "active") {
      alert("Học viên hiện không có lớp đang học.");
      return;
    }
    const effective = tuitionForDueStatus.find((entry) => entry.id === item.id);
    const remaining = Math.max(
      Number(effective?.effective_amount_due ?? item.amount_due) -
        Number(effective?.effective_amount_paid ?? item.amount_paid),
      0
    );
    const amount = amountOverride ?? remaining;
    if (amount <= 0 || amount > remaining) {
      alert("Số tiền thu không hợp lệ hoặc kỳ này đã được thanh toán đủ.");
      return;
    }
    const nextPeriod = getFirstUnpaidMonth(membership, tuitionForDueStatus, currentMonth);
    const assigned = determineActiveClasses(
      student.id,
      classes.filter((entry) => entry.status === "active"),
      activeMemberships
    );
    setStudentId(student.id);
    setStudentSearch(student.full_name);
    setStudentClassIds(assigned.classes.map((entry) => entry.id));
    setClassId(classItem.id);
    setCollectionMonth(period);
    setManualPeriod(period !== nextPeriod);
    setAmountDue(String(item.amount_due));
    setAmountToCollect(String(amount));
    setPaymentMethod(method);
    setNote("");
    setShowForm(true);
    window.setTimeout(() => document.getElementById("create-tuition-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function markPaid(item: Tuition) {
    openCollectionForTuition(item);
  }

  function confirmVoicePayment() {
    if (!voicePayment) return;

    const { item, amount, method } = voicePayment;

    setVoicePayment(null);
    openCollectionForTuition(item, amount, method);
  }

  function studentName(id: string) {
    const student = studentById.get(id);
    return student
      ? `${student.full_name} · ${student.student_code}`
      : "Không rõ";
  }

  function className(id: string | null) {
    return (id ? classById.get(id)?.name : null) ?? "Chưa chọn lớp";
  }

  function branchName(id: string | null) {
    return (id ? branchById.get(id)?.name : null) ?? "Chưa gán cơ sở";
  }

  function paymentsForTuition(tuitionId: string) {
    return paymentsByTuition.get(tuitionId) ?? [];
  }

  const filteredTuition = useMemo(() => {
    const billingDate = `${billingMonth.slice(0, 7)}-01`;
    const q = search.trim().toLowerCase();

    return tuition.filter((item) => {
      // Giữ nguyên quy tắc hiện tại: chỉ tính học phí của tháng đang xem.
      if (item.billing_month !== billingDate) return false;
      if (focusedStudent && item.student_id !== focusedStudent.id) return false;

      if (!q) return true;

      const student = studentById.get(item.student_id);
      const studentLabel = student
        ? `${student.student_code} ${student.full_name}`
        : "Không rõ";
      const classLabel = item.class_id
        ? classById.get(item.class_id)?.name ?? "Chưa chọn lớp"
        : "Chưa chọn lớp";
      const branchLabel = item.branch_id
        ? branchById.get(item.branch_id)?.name ?? "Chưa gán cơ sở"
        : "Chưa gán cơ sở";

      return (
        studentLabel.toLowerCase().includes(q) ||
        classLabel.toLowerCase().includes(q) ||
        branchLabel.toLowerCase().includes(q)
      );
    });
  }, [
    tuition,
    billingMonth,
    search,
    studentById,
    classById,
    branchById,
    focusedStudent,
  ]);

  useEffect(() => {
    setVisibleTuitionCount(TUITION_PER_BATCH);
  }, [billingMonth, focusedStudentId, search]);

  const visibleTuition = useMemo(
    () => filteredTuition.slice(0, visibleTuitionCount),
    [filteredTuition, visibleTuitionCount]
  );

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();

    return students
      .filter((student) =>
        `${student.student_code} ${student.full_name}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 12);
  }, [students, studentSearch]);

  const activeClassesByBranch = useMemo(() => {
    const result = new Map<string, ClassItem[]>();

    for (const item of activeClasses) {
      const items = result.get(item.branch_id) ?? [];
      items.push(item);
      result.set(item.branch_id, items);
    }

    return result;
  }, [activeClasses]);

  const selectedClass = classes.find((item) => item.id === classId);
  const selectedCollectionMembership = activeMemberships.find(
    (item) => item.student_id === studentId && item.class_id === classId
  );
  const selectedCollectionStatus = selectedStudent && selectedClass && selectedCollectionMembership
    ? getMembershipTuitionStatus(
        selectedCollectionMembership,
        selectedStudent.status,
        selectedClass.status,
        tuitionForDueStatus,
        currentMonth
      )
    : null;
  const selectedCollectionRecord = tuition.find(
    (item) =>
      item.student_id === studentId &&
      item.class_id === classId &&
      monthKey(item.billing_month) === collectionMonth
  );
  const selectedCollectionEffective = selectedCollectionRecord
    ? tuitionForDueStatus.find((item) => item.id === selectedCollectionRecord.id)
    : undefined;

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
        <p className="mt-2 text-slate-400">Thu học phí khi nhận tiền</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="ui-btn ui-btn-primary"
            onClick={() => {
              setShowForm(!showForm);
              setIsNewStudentFlow(false);
            }}
          >
            {showForm ? "Đóng" : "+ Thu học phí"}
          </button>
        </div>
      </section>

      {focusedStudent && (
        <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 break-words text-sm font-bold text-blue-900 [overflow-wrap:anywhere]">
            Đang xem: {focusedStudent.full_name} · {monthLabel(billingMonth)}
          </div>
          <button
            type="button"
            onClick={() => {
              setFocusedStudentId("");
              setSearch("");
              window.history.replaceState({}, "", "/tuition");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-black text-blue-700 hover:bg-blue-100"
          >
            Xem tất cả học viên
          </button>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">ĐÃ THU THÁNG NÀY</div>
          <div className="mt-2 text-3xl font-black text-emerald-600">{money(collectedThisMonth)}</div>
        </div>

        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">CẦN THU</div>
          <div className="mt-2 text-3xl font-black">{dueCount}</div>
        </div>

        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">QUÁ HẠN</div>
          <div className="mt-2 text-3xl font-black text-rose-500">{overdueCount}</div>
        </div>
      </section>

      <section className="ui-card overflow-hidden">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h2 className="text-2xl font-black">Cần thu</h2>
          <p className="mt-1 text-sm text-slate-500">Danh sách được tính từ lớp đang học và lịch sử học phí; chưa thu thì chưa tạo phiếu.</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">Đang tính kỳ cần thu…</div>
        ) : actionableDueRows.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Hiện không có học viên đến hạn.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {actionableDueRows.map((row) => {
              const period = row.due.firstUnpaidMonth ?? currentMonth;
              const overdue = period < currentMonth;
              const branch = branchById.get(row.classItem.branch_id)?.name ?? "Chưa gán cơ sở";
              return (
                <div key={`${row.student.id}-${row.classItem.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900">{row.student.full_name} <span className="text-xs font-bold text-blue-600">{row.student.student_code}</span></div>
                    <div className="mt-1 text-sm text-slate-500">{row.classItem.name} · {branch} · Kỳ {monthLabel(period)}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                      <span className={`rounded-full px-3 py-1 ${row.due.status === "PARTIAL" ? "bg-amber-100 text-amber-800" : overdue ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}`}>
                        {row.due.status === "PARTIAL" ? "Còn thiếu" : overdue ? "Quá hạn" : "Đến hạn"}
                      </span>
                      {row.due.paidThroughMonth && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Đã đóng đến {monthLabel(row.due.paidThroughMonth)}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                    <strong>{money(row.due.remaining > 0 ? row.due.remaining : row.suggestedAmount)}</strong>
                    <button type="button" className="ui-btn ui-btn-primary" onClick={() => {
                      setStudentId(row.student.id);
                      setStudentSearch(row.student.full_name);
                      setStudentClassIds([row.classItem.id]);
                      setClassId(row.classItem.id);
                      setCollectionMonth(period);
                      setManualPeriod(false);
                      setNote("");
                      setShowForm(true);
                      window.setTimeout(() => document.getElementById("create-tuition-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                    }}>Thu học phí</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showForm && (
        <section id="create-tuition-form" className="ui-card p-6 sm:p-8">
          <div className="mb-6">
            <div className="text-xs font-black uppercase tracking-widest text-blue-600">
              XÁC NHẬN KHOẢN THU
            </div>
            <h2 className="mt-1 text-2xl font-black">
              Thu học phí
            </h2>
            {isNewStudentFlow && (
              <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                ✅ Học viên đã được tạo. Học phí chỉ được ghi nhận sau khi xác nhận đã nhận tiền.
              </div>
            )}
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
                  placeholder="🔎 Gõ mã hoặc tên học viên..."
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
                          onClick={() => {
                            setStudentId(student.id);
                            setStudentSearch(student.full_name);
                            setShowStudentSearch(false);
                            setClassId("");
                            setAmountDue("");
                            setAmountToCollect("");
                            setManualPeriod(false);
                            setNote("");
                            setStudentClassIds(
                              activeMemberships
                                .filter(
                                  (membership) =>
                                    membership.student_id === student.id
                                )
                                .map((membership) => membership.class_id)
                            );
                          }}
                        >
                          <div className="font-semibold">
                            {student.full_name} · {student.student_code}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </label>

            {studentId && studentClasses.length === 0 && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800 md:col-span-2">
                Học viên hiện không có lớp đang học.
              </div>
            )}

            {studentClasses.length === 1 && selectedClass && (
              <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Lớp đang học</div>
                <div className="mt-1 font-black">{selectedClass.name} · {branchName(selectedClass.branch_id)}</div>
              </div>
            )}

            {studentClasses.length > 1 && (
              <label className="block md:col-span-2">
                <div className="mb-2 text-sm font-bold">Chọn lớp cần thu</div>
                <select value={classId} onChange={(e) => setClassId(e.target.value)} className="ui-input">
                  <option value="">-- Chọn lớp --</option>
                  {studentClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {branchName(item.branch_id)}</option>)}
                </select>
              </label>
            )}

            {selectedStudent && selectedClass && selectedCollectionStatus && (
              <div className="grid gap-2 rounded-3xl bg-blue-50 p-5 text-sm text-blue-900 md:col-span-2 md:grid-cols-2">
                <div><span className="text-blue-700">Học viên:</span> <b>{selectedStudent.full_name} · {selectedStudent.student_code}</b></div>
                <div><span className="text-blue-700">Cơ sở:</span> <b>{branchName(selectedClass.branch_id)}</b></div>
                <div><span className="text-blue-700">Đã đóng đến:</span> <b>{selectedCollectionStatus.paidThroughMonth ? monthLabel(selectedCollectionStatus.paidThroughMonth) : "Chưa có kỳ đã đóng"}</b></div>
                <div><span className="text-blue-700">Kỳ cần thu:</span> <b>{monthLabel(collectionMonth)}</b></div>
                {selectedCollectionRecord && <div className="md:col-span-2"><span className="text-blue-700">Đã ghi nhận kỳ này:</span> <b>{money(Number(selectedCollectionRecord.amount_paid))}</b> · <span className="text-blue-700">Còn thiếu:</span> <b>{money(Math.max(Number(selectedCollectionEffective?.effective_amount_due ?? selectedCollectionRecord.amount_due) - Number(selectedCollectionEffective?.effective_amount_paid ?? selectedCollectionRecord.amount_paid), 0))}</b></div>}
              </div>
            )}

            <div className="md:col-span-2">
              <button type="button" className="text-sm font-bold text-blue-700 underline" onClick={() => setManualPeriod((value) => !value)}>
                {manualPeriod ? "Dùng kỳ tiếp theo tự động" : "Chọn kỳ khác (điều chỉnh thủ công)"}
              </button>
              {manualPeriod && (
                <label className="mt-3 block max-w-sm">
                  <span className="mb-2 block text-sm font-bold">Kỳ học phí</span>
                  <input type="month" value={collectionMonth} onChange={(e) => setCollectionMonth(e.target.value)} className="ui-input" />
                </label>
              )}
            </div>

            <label className="block">
              <div className="mb-2 text-sm font-bold">Số tiền đề xuất</div>
              <input type="number" min="0" step="1000" value={amountDue} onChange={(e) => setAmountDue(e.target.value)} className="ui-input" />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold">Số tiền thực thu</div>
              <input type="number" min="1" step="1000" value={amountToCollect} onChange={(e) => setAmountToCollect(e.target.value)} className="ui-input" />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold">Phương thức thanh toán</div>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "cash" | "transfer")} className="ui-input">
                <option value="cash">Tiền mặt</option>
                <option value="transfer">Chuyển khoản</option>
              </select>
            </label>

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
                disabled={saving || !studentId || !classId || studentClasses.length === 0 || Number(amountToCollect) <= 0}
              >
                {saving ? "Đang ghi nhận..." : "✅ Xác nhận thu học phí"}
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
            const branchClasses = activeClassesByBranch.get(branch.id) ?? [];

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
                        <span className="ml-2 text-xs font-black text-blue-600">
                          {student.student_code}
                        </span>
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

      <section id="tuition-list" className="ui-card scroll-mt-6 overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black">📋 Danh sách học phí</h2>
              <p className="mt-1 text-sm text-slate-400">
                {focusedStudent
                  ? `${focusedStudent.full_name} · ${monthLabel(billingMonth)}`
                  : `Đang hiển thị ${visibleTuition.length}/${filteredTuition.length} khoản học phí`}
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
            {focusedStudent
              ? `${focusedStudent.full_name} chưa có học phí ${monthLabel(billingMonth)}.`
              : "Chưa có học phí."}
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
                {visibleTuition.map((item) => {
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

            {visibleTuition.length < filteredTuition.length && (
              <div className="border-t border-slate-100 p-5 text-center">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleTuitionCount((current) =>
                      Math.min(
                        current + TUITION_PER_BATCH,
                        filteredTuition.length
                      )
                    )
                  }
                  className="ui-btn ui-btn-light"
                >
                  Hiển thị thêm {Math.min(
                    TUITION_PER_BATCH,
                    filteredTuition.length - visibleTuition.length
                  )} khoản học phí
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
