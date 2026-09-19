"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  EmptyState,
  MobileListRow,
  MobilePageHeader,
  MobilePageShell,
} from "@/components/ui/mobile-ui";
import {
  toVietnamDateKey,
  vietnamCurrentMonth,
  vietnamToday,
} from "@/lib/vietnam-date";

type Student = {
  id: string;
  student_code: string;
  full_name: string;
  status: string | null;
  created_at: string;
};

type DanceClass = {
  id: string;
  name: string;
  branch_id: string;
  status: string;
  monthly_fee: number;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
};

type ClassStudent = {
  class_id: string;
  student_id: string;
  status: string | null;
};

type Branch = {
  id: string;
  name: string;
};

type Payment = {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
};

type OtherRevenue = {
  id: string;
  amount: number;
  revenue_date: string;
};

type Expense = {
  id: string;
  amount: number;
  expense_date: string;
  category: string;
  description: string | null;
};

type TuitionAdjustment = {
  id: string;
  student_id: string;
  action: string;
  amount: number;
  created_at: string;
};


type SpeechRecognitionResult = {
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResult[];
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
};


const money = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + " đ";

const dateVN = (value: string) =>
  new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

const categoryLabel: Record<string, string> = {
  rent: "Thuê mặt bằng",
  salary: "Lương",
  utilities: "Điện nước",
  equipment: "Thiết bị",
  marketing: "Marketing",
  other: "Khác",
};

function shiftMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));

  return `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

type TuitionForAlert = {
  id: string;
  student_id: string;
  class_id: string | null;
  billing_month: string;
  amount_due: number;
  amount_paid: number;
};

type TeacherForAlert = {
  id: string;
  full_name: string;
  status: string | null;
};

type PayrollForAlert = {
  id: string;
  teacher_id: string;
  payroll_month: string;
  status: string | null;
};

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [students, setStudents] = useState<Student[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [isVoiceSearching, setIsVoiceSearching] = useState(false);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [otherRevenues, setOtherRevenues] = useState<OtherRevenue[]>([]);
  const [adjustments, setAdjustments] = useState<TuitionAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tuitionAlerts, setTuitionAlerts] = useState<TuitionForAlert[]>([]);
  const [teachersAlerts, setTeachersAlerts] = useState<TeacherForAlert[]>([]);
  const [payrollAlerts, setPayrollAlerts] = useState<PayrollForAlert[]>([]);
  const [pendingSubstitutionCount, setPendingSubstitutionCount] = useState(0);
  const [attendedClassIds, setAttendedClassIds] = useState<Set<string>>(new Set());

  const [classStudents, setClassStudents] = useState<ClassStudent[]>([]);


  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const dashboardMonth = vietnamCurrentMonth();
    const previousDashboardMonth = shiftMonthKey(dashboardMonth, -1);
    const nextDashboardMonth = shiftMonthKey(dashboardMonth, 1);
    const currentMonthStart = `${dashboardMonth}-01`;
    const previousMonthStart = `${previousDashboardMonth}-01`;
    const nextMonthStart = `${nextDashboardMonth}-01`;

    const [
      studentsRes,
      classesRes,
      branchesRes,
      paymentsRes,
      expensesRes,
      adjustmentsRes,
      classStudentsRes,
      tuitionAlertsRes,
      teachersAlertsRes,
      payrollAlertsRes,
      substitutionRequestsRes,
      otherRevenuesRes,
      todayAttendanceRes,
    ] = await Promise.all([
        supabase
          .from("students")
          .select("id,student_code,full_name,status,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("classes")
          .select(
            "id,name,branch_id,status,monthly_fee,schedule_days,schedule_start,schedule_end"
          )
          .order("name"),
        supabase
          .from("branches")
          .select("id,name")
          .order("name"),
        supabase
          .from("tuition_payments")
          .select("id,amount,payment_date,payment_method")
          .gte("payment_date", previousMonthStart)
          .lt("payment_date", nextMonthStart)
          .order("payment_date", { ascending: false }),
        supabase
          .from("expenses")
          .select("id,amount,expense_date,category,description")
          .gte("expense_date", currentMonthStart)
          .lt("expense_date", nextMonthStart)
          .order("expense_date", { ascending: false }),
        supabase
          .from("tuition_adjustments")
          .select("id,student_id,action,amount,created_at")
          .eq("action", "refund")
          .gte("created_at", `${currentMonthStart}T00:00:00+07:00`)
          .lt("created_at", `${nextMonthStart}T00:00:00+07:00`)
          .order("created_at", { ascending: false }),

        supabase
          .from("class_students")
          .select("class_id,student_id,status")
          .eq("status", "active"),

        supabase
          .from("tuition")
          .select("id,student_id,class_id,billing_month,amount_due,amount_paid")
          .eq("billing_month", currentMonthStart),

        supabase
          .from("teachers")
          .select("id,full_name,status")
          .eq("status", "active"),

        supabase
          .from("teacher_payrolls")
          .select("id,teacher_id,payroll_month,status")
          .eq("payroll_month", currentMonthStart),
        supabase
          .from("teacher_substitution_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("other_revenues")
          .select("id,amount,revenue_date")
          .gte("revenue_date", previousMonthStart)
          .lt("revenue_date", nextMonthStart)
          .order("revenue_date", { ascending: false }),
        supabase
          .from("attendance")
          .select("class_id")
          .eq("attendance_date", vietnamToday()),
      ]);

    if (studentsRes.error) console.error(studentsRes.error);
    if (classesRes.error) console.error(classesRes.error);
    if (branchesRes.error) console.error(branchesRes.error);
    if (paymentsRes.error) console.error(paymentsRes.error);
    if (expensesRes.error) console.error(expensesRes.error);
    if (adjustmentsRes.error) console.error(adjustmentsRes.error);
    if (classStudentsRes.error) console.error(classStudentsRes.error);
    if (tuitionAlertsRes.error) console.error(tuitionAlertsRes.error);
    if (teachersAlertsRes.error) console.error(teachersAlertsRes.error);
    if (payrollAlertsRes.error) console.error(payrollAlertsRes.error);
    if (substitutionRequestsRes.error) {
      console.error(substitutionRequestsRes.error);
    }
    if (otherRevenuesRes.error) console.error(otherRevenuesRes.error);
    if (todayAttendanceRes.error) console.error(todayAttendanceRes.error);

    setPendingSubstitutionCount(substitutionRequestsRes.count ?? 0);
    setAttendedClassIds(new Set((todayAttendanceRes.data ?? []).map((row) => row.class_id)));

    setStudents(studentsRes.data ?? []);
    setClasses(classesRes.data ?? []);
    setBranches(branchesRes.data ?? []);
    setClassStudents(classStudentsRes.data ?? []);
    setTuitionAlerts((tuitionAlertsRes.data ?? []) as TuitionForAlert[]);
    setTeachersAlerts((teachersAlertsRes.data ?? []) as TeacherForAlert[]);
    setPayrollAlerts((payrollAlertsRes.data ?? []) as PayrollForAlert[]);
    
    setPayments(paymentsRes.data ?? []);
    setExpenses(expensesRes.data ?? []);
    setOtherRevenues((otherRevenuesRes.data ?? []) as OtherRevenue[]);
    setAdjustments((adjustmentsRes.data ?? []) as TuitionAdjustment[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const savedSearch = window.sessionStorage.getItem("abk-dashboard-search");
    if (savedSearch) setGlobalSearch(savedSearch);
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("abk-dashboard-search", globalSearch);
  }, [globalSearch]);


  function getGlobalSearchResults() {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];

    const results: Array<{
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }> = [];

    students.forEach((student) => {
      if (
        student.full_name.toLowerCase().includes(q) ||
        student.student_code.toLowerCase().includes(q)
      ) {
        results.push({
          id: `student-${student.id}`,
          title: student.full_name,
          subtitle: `🧑‍🎓 Học viên · ${student.student_code}`,
          href: `/students/${student.id}`,
        });
      }
    });

    classes.forEach((cls) => {
      if (cls.name.toLowerCase().includes(q)) {
        const branch = branches.find((b) => b.id === cls.branch_id);
        results.push({
          id: `class-${cls.id}`,
          title: cls.name,
          subtitle: branch ? `💃 Lớp học • ${branch.name}` : "💃 Lớp học",
          href: `/branches/${cls.id}`,
        });
      }
    });

    branches.forEach((branch) => {
      if (branch.name.toLowerCase().includes(q)) {
        results.push({
          id: `branch-${branch.id}`,
          title: branch.name,
          subtitle: "🏢 Cơ sở",
          href: "/branches",
        });
      }
    });

    return results.slice(0, 10);
  }

  const startGlobalVoiceSearch = () => {
    if (typeof window === "undefined") return;

    const speechWindow = window as WindowWithSpeechRecognition;
    const SpeechRecognitionCtor =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      alert("Trình duyệt này chưa hỗ trợ tìm kiếm bằng giọng nói.");
      return;
    }

    // Hiện trạng thái ngay trước khi khởi động microphone.
    setIsVoiceSearching(true);

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "vi-VN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const firstResult = event.results[0];
      const transcript =
        firstResult && firstResult[0]
          ? firstResult[0].transcript
          : "";

      setGlobalSearch(transcript);
    };

    recognition.onend = () => {
      setIsVoiceSearching(false);
    };

    recognition.onerror = () => {
      setIsVoiceSearching(false);
    };

    // Cho Android kịp render trạng thái 🔴 trước khi gọi mic.
    window.setTimeout(() => {
      try {
        recognition.start();
      } catch {
        setIsVoiceSearching(false);
      }
    }, 0);
  };

  // Luôn dùng múi giờ Việt Nam để Dashboard không bị lệch ngày
  // khi máy/browser đang ở timezone khác.
  const vietnamNowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const vnPart = (type: string) =>
    vietnamNowParts.find((part) => part.type === type)?.value ?? "0";

  const now = new Date(
    Number(vnPart("year")),
    Number(vnPart("month")) - 1,
    Number(vnPart("day")),
    Number(vnPart("hour")),
    Number(vnPart("minute")),
    Number(vnPart("second"))
  );

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const financeMonthKey =
    `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  const monthPayments = useMemo(
    () =>
      payments.filter((item) =>
        String(item.payment_date ?? "").startsWith(financeMonthKey)
      ),
    [payments, financeMonthKey]
  );

  const monthOtherRevenues = useMemo(
    () =>
      otherRevenues.filter((item) =>
        String(item.revenue_date ?? "").startsWith(financeMonthKey)
      ),
    [otherRevenues, financeMonthKey]
  );

  const monthExpenses = useMemo(
    () =>
      expenses.filter((item) =>
        String(item.expense_date ?? "").startsWith(financeMonthKey)
      ),
    [expenses, financeMonthKey]
  );

  const tuitionRevenue = monthPayments.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const otherRevenue = monthOtherRevenues.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const revenue = tuitionRevenue + otherRevenue;
  const refundTotal = adjustments.reduce((sum, item) => {
    const refundDate = toVietnamDateKey(item.created_at);

    return refundDate.startsWith(financeMonthKey)
      ? sum + Number(item.amount || 0)
      : sum;
  }, 0);
  const expenseTotal = monthExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const balance = revenue - refundTotal - expenseTotal;

  const activeStudents = students.filter(
    (student) => student.status === "active"
  ).length;

  const activeClasses = classes.filter(
    (item) => item.status === "active"
  ).length;

  const recentPayments = monthPayments.slice(0, 5);
  const recentExpenses = monthExpenses.slice(0, 5);

  const branchStats = branches.map((branch) => ({
    ...branch,
    classes: classes.filter(
      (item) => item.branch_id === branch.id && item.status === "active"
    ).length,
  }));

  // Dữ liệu schedule_days của CLB: T2=2 ... T7=7, CN="CN".
  // JS getDay(): CN=0, T2=1 ... T7=6.
  // Dùng 8 nội bộ cho CN để không nhầm CN với T7.
  const todayDay = now.getDay() === 0 ? 8 : now.getDay() + 1;

  const todayClasses = useMemo(() => {
    // schedule_days của CLB: T2=2 ... T7=7, CN="CN".
    const dayNames: Record<string, number> = {
      sun: 8,
      sunday: 8,
      cn: 8,
      "chủ nhật": 8,
      mon: 1,
      monday: 1,
      t2: 1,
      "thứ 2": 1,
      tue: 2,
      tuesday: 2,
      t3: 2,
      "thứ 3": 2,
      wed: 3,
      wednesday: 3,
      t4: 3,
      "thứ 4": 3,
      thu: 4,
      thursday: 4,
      t5: 4,
      "thứ 5": 4,
      fri: 5,
      friday: 5,
      t6: 5,
      "thứ 6": 5,
      sat: 6,
      saturday: 6,
      t7: 6,
      "thứ 7": 6,
    };

    const normalizeDay = (value: string) => {
      const text = value.trim().toLowerCase();

      if (/^\d+$/.test(text)) {
        const n = Number(text);
        return n >= 2 && n <= 7 ? n : null;
      }

      return dayNames[text] ?? null;
    };

    return classes
      .filter((item) => {
        if (item.status !== "active") return false;
        if (!Array.isArray(item.schedule_days)) return false;

        return item.schedule_days.some(
          (day) => normalizeDay(String(day)) === todayDay
        );
      })
      .map((item) => {
        const branch = branches.find((b) => b.id === item.branch_id);

        const studentCount = classStudents.filter(
          (membership) =>
            membership.class_id === item.id &&
            membership.status === "active"
        ).length;

        return {
          ...item,
          branchName: branch?.name ?? "Chưa gán cơ sở",
          studentCount,
        };
      })
      .sort((a, b) => {
        const aTime = a.schedule_start ?? "99:99";
        const bTime = b.schedule_start ?? "99:99";
        return aTime.localeCompare(bTime);
      });
  }, [classes, branches, classStudents, todayDay]);

  const currentMonthKey =
    `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  const activeStudentIds = new Set(
    students
      .filter((student) => student.status === "active")
      .map((student) => student.id)
  );

  const unpaidTuitionThisMonth = tuitionAlerts.filter((item) => {
    if (!activeStudentIds.has(item.student_id)) return false;

    const billing = String(item.billing_month ?? "").trim();

    // Hỗ trợ cả YYYY-MM và YYYY-MM-DD.
    const sameMonth =
      billing === currentMonthKey ||
      billing.startsWith(currentMonthKey + "-");

    return (
      sameMonth &&
      Number(item.amount_due || 0) > Number(item.amount_paid || 0)
    );
  });

  const unpaidStudentIds = new Set(
    unpaidTuitionThisMonth.map((item) => item.student_id)
  );

  const unpaidClassCounts = new Map<string, Set<string>>();

  unpaidTuitionThisMonth.forEach((item) => {
    if (!item.class_id) return;

    if (!unpaidClassCounts.has(item.class_id)) {
      unpaidClassCounts.set(item.class_id, new Set<string>());
    }

    unpaidClassCounts.get(item.class_id)!.add(item.student_id);
  });

  const unpaidClasses = Array.from(unpaidClassCounts.entries())
    .map(([classId, studentIds]) => {
      const cls = classes.find((item) => item.id === classId);

      return {
        classId,
        name: cls?.name ?? "Lớp không xác định",
        count: studentIds.size,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const payrollCompletedTeacherIds = new Set(
    payrollAlerts
      .filter(
        (item) =>
          item.payroll_month.startsWith(currentMonthKey) &&
          (item.status === "locked" || item.status === "paid")
      )
      .map((item) => item.teacher_id)
  );

  const payrollCompletedCount = teachersAlerts.filter((teacher) =>
    payrollCompletedTeacherIds.has(teacher.id)
  ).length;

  const payrollPendingCount = Math.max(
    0,
    teachersAlerts.length - payrollCompletedCount
  );

  const smartAlerts = {
    unpaidStudents: unpaidStudentIds.size,
    unpaidClasses,
    payrollCompletedCount,
    activeTeachersCount: teachersAlerts.length,
    payrollPendingCount,
  };

  const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const previousMonthYear =
    currentMonth === 0 ? currentYear - 1 : currentYear;

  const previousMonthKey =
    `${previousMonthYear}-${String(previousMonth + 1).padStart(2, "0")}`;

  const previousMonthTuitionRevenue = payments
    .filter((payment) =>
      String(payment.payment_date ?? "").startsWith(previousMonthKey)
    )
    .reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

  const previousMonthOtherRevenue = otherRevenues
    .filter((item) =>
      String(item.revenue_date ?? "").startsWith(previousMonthKey)
    )
    .reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

  const previousMonthRevenue =
    previousMonthTuitionRevenue + previousMonthOtherRevenue;

  const revenueChange =
    previousMonthRevenue > 0
      ? ((revenue - previousMonthRevenue) / previousMonthRevenue) * 100
      : null;

  const currentMonthStartKey = `${currentMonthKey}-01`;

  const previousMonthActiveStudents = students.filter((student) => {
    if (student.status !== "active") return false;

    const createdDate = toVietnamDateKey(student.created_at);

    return createdDate !== "" && createdDate < currentMonthStartKey;
  }).length;

  const studentChange = activeStudents - previousMonthActiveStudents;

  const todayKey = vietnamToday();

  const todayTuitionRevenue = payments
    .filter(
      (payment) =>
        String(payment.payment_date ?? "").slice(0, 10) === todayKey
    )
    .reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

  const todayOtherRevenue = otherRevenues
    .filter(
      (item) =>
        String(item.revenue_date ?? "").slice(0, 10) === todayKey
    )
    .reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

  const todayRevenue =
    todayTuitionRevenue + todayOtherRevenue;

  const todayExpenseTotal = expenses
    .filter(
      (item) =>
        String(item.expense_date ?? "").slice(0, 10) === todayKey
    )
    .reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

  const todayNewStudents = students.filter(
    (item) =>
      toVietnamDateKey(item.created_at) === todayKey
  ).length;

  const todayPaymentCount = payments.filter(
    (item) =>
      String(item.payment_date ?? "").slice(0, 10) === todayKey
  ).length;

  const mobileSearchResults = getGlobalSearchResults();
  const greeting = now.getHours() < 12
    ? "Chào buổi sáng"
    : now.getHours() < 18
      ? "Chào buổi chiều"
      : "Chào buổi tối";
  const attendedTodayCount = todayClasses.filter((item) => attendedClassIds.has(item.id)).length;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  function mobileClassStatus(classId: string, start: string | null) {
    if (attendedClassIds.has(classId)) return "Đã điểm danh";
    if (!start) return "Chưa điểm danh";
    const [hours, minutes] = start.split(":").map(Number);
    return currentMinutes < hours * 60 + minutes ? "Sắp bắt đầu" : "Chưa điểm danh";
  }

  return (
    <>
      <MobilePageShell>
        <MobilePageHeader
          eyebrow={`${greeting} 👋`}
          title="Hôm nay"
          description={todayKey.split("-").reverse().join("/")}
        />

        <section aria-label="Tổng quan hôm nay" className="abk-mobile-card overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
            <Link href="/branches" className="p-4"><strong className="block text-xl font-black text-slate-950">{loading ? "—" : todayClasses.length}</strong><span className="mt-1 block text-xs font-bold text-slate-500">lớp hôm nay</span></Link>
            <Link href="/students" className="p-4"><strong className="block text-xl font-black text-slate-950">{loading ? "—" : activeStudents}</strong><span className="mt-1 block text-xs font-bold text-slate-500">học viên hoạt động</span></Link>
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 py-3 text-sm font-bold"><span className="text-emerald-700">✓ {attendedTodayCount} lớp đã điểm danh</span><span className="text-slate-500">○ {Math.max(0, todayClasses.length - attendedTodayCount)} lớp chưa điểm danh</span></div>
          <Link href="/tuition" className="flex items-end justify-between gap-3 border-t border-slate-100 px-4 py-3"><span className="text-sm font-extrabold text-slate-600">💰 Thu hôm nay</span><strong className="text-lg font-black text-emerald-700">{loading ? "—" : money(todayRevenue)}</strong></Link>
          {smartAlerts.unpaidStudents > 0 ? <Link href="/tuition" className="block border-t border-amber-100 bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-800">⚠️ {smartAlerts.unpaidStudents} học viên cần xử lý học phí <span aria-hidden="true">›</span></Link> : null}
        </section>

        <section className="abk-section" aria-labelledby="mobile-attention-title">
          <h2 id="mobile-attention-title" className="abk-section-title text-lg">Việc cần làm</h2>
          <div className="abk-mobile-card overflow-hidden">
            {todayClasses.map((item) => <MobileListRow key={item.id} href="/attendance" leading={item.schedule_start?.slice(0, 5) ?? "♪"} title={item.name} subtitle={`${item.studentCount} học viên · ${mobileClassStatus(item.id, item.schedule_start)}`} />)}
            {pendingSubstitutionCount > 0 ? <MobileListRow href="/teacher-payroll/substitution" leading="🔄" title={`${pendingSubstitutionCount} yêu cầu dạy thay`} subtitle="Đang chờ duyệt" /> : null}
            {smartAlerts.payrollPendingCount > 0 ? <MobileListRow href="/teacher-payroll" leading="◷" title={`${smartAlerts.payrollPendingCount} giáo viên chưa chốt lương`} subtitle={`Đã chốt ${smartAlerts.payrollCompletedCount}/${smartAlerts.activeTeachersCount}`} /> : null}
            {!loading && todayClasses.length === 0 && pendingSubstitutionCount === 0 && smartAlerts.payrollPendingCount === 0 ? <EmptyState icon="✓" title="Hôm nay chưa có việc cần xử lý" description="Các đầu việc mới sẽ xuất hiện tại đây." /> : null}
          </div>
        </section>

        <section className="abk-section" aria-labelledby="mobile-search-title">
          <h2 id="mobile-search-title" className="sr-only">Tìm nhanh</h2>
          <label className="relative block"><span className="sr-only">Tìm học viên, lớp học hoặc cơ sở</span><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Tìm học viên, lớp học, cơ sở…" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-base font-semibold shadow-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />{globalSearch ? <button type="button" onClick={() => setGlobalSearch("")} className="absolute right-1 top-0 flex h-12 w-11 items-center justify-center text-xl text-slate-400" aria-label="Xóa tìm kiếm">×</button> : null}</label>
          {globalSearch.trim() ? <div className="abk-mobile-card mt-2 overflow-hidden">{mobileSearchResults.length ? mobileSearchResults.map((item) => <MobileListRow key={item.id} href={item.href} title={item.title} subtitle={item.subtitle} />) : <EmptyState icon="⌕" title="Không tìm thấy kết quả" description="Thử tên, mã học viên, lớp hoặc cơ sở khác." />}</div> : null}
        </section>

        <section className="abk-section" aria-labelledby="mobile-summary-title">
          <h2 id="mobile-summary-title" className="abk-section-title">Tóm tắt hoạt động</h2>
          <div className="abk-mobile-card grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden">
            {[{ label: "Học viên", value: `${activeStudents}`, href: "/students" }, { label: "Lớp hoạt động", value: `${activeClasses}`, href: "/branches" }, { label: "Học viên mới", value: `${todayNewStudents}`, href: "/students" }, { label: "Chi hôm nay", value: money(todayExpenseTotal), href: "/expenses" }].map((item) => <Link key={item.label} href={item.href} className="min-h-[88px] p-4"><span className="block text-xs font-bold text-slate-500">{item.label}</span><strong className="mt-2 block truncate text-base font-black text-slate-900">{loading ? "—" : item.value}</strong></Link>)}
          </div>
        </section>
      </MobilePageShell>

      <div className="hidden space-y-7 lg:block">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-7 text-white shadow-[0_12px_0_rgba(15,23,42,.14),0_25px_45px_rgba(15,23,42,.14)] sm:px-8">
        <div className="relative z-10">
          <div className="text-sm font-bold text-blue-300">
            TRUNG TÂM QUẢN LÝ
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Dashboard
          </h1>

          <p className="mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
            Tổng quan hoạt động CLB trong tháng{" "}
            {String(currentMonth + 1).padStart(2, "0")}/{currentYear}
          </p>
        </div>

        <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="absolute -bottom-28 right-28 h-56 w-56 rounded-full bg-indigo-400/10 blur-2xl" />

        <div className="absolute right-7 top-7 hidden rounded-2xl bg-white/10 px-4 py-3 text-center backdrop-blur-md sm:block">
          <div className="text-xs text-slate-300">Hôm nay</div>
          <div className="mt-1 text-lg font-black">
            {todayKey.split("-").reverse().join("/")}
          </div>
        </div>
      </section>

      {/* CẢNH BÁO DẠY THAY */}
      {pendingSubstitutionCount > 0 && (
        <Link
          href="/teacher-payroll/substitution"
          className="group flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-xl">
              🔔
            </div>
            <div>
              <div className="font-black text-amber-900">
                Có {pendingSubstitutionCount} yêu cầu GV dạy thay đang chờ duyệt
              </div>
              <div className="mt-0.5 text-xs font-medium text-amber-700">
                Bấm để xem và xử lý yêu cầu
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-amber-300 px-2 text-sm font-black text-amber-900">
              {pendingSubstitutionCount}
            </span>
            <span className="text-lg text-amber-500 transition group-hover:translate-x-1">
              →
            </span>
          </div>
        </Link>
      )}

      {/* GLOBAL SEARCH */}
      <section
        id="global-dashboard-search"
        className="ui-card overflow-hidden p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="relative">
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="🔎 Tìm học viên, lớp học, cơ sở..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm font-semibold outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label="Xóa tìm kiếm"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={startGlobalVoiceSearch}
            disabled={isVoiceSearching}
            className={`flex shrink-0 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-sm transition ${
              isVoiceSearching
                ? "bg-red-600 animate-pulse cursor-wait"
                : "bg-slate-900 hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
            }`}
            title="Tìm kiếm bằng giọng nói"
          >
            {isVoiceSearching ? (
              <>
                🔴 <span>Đang nghe...</span>
              </>
            ) : (
              <>
                🎙️ <span>Giọng nói</span>
              </>
            )}
          </button>
        </div>

        {globalSearch.trim() && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            {getGlobalSearchResults().length > 0 ? (
              getGlobalSearchResults().map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setGlobalSearch("")}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-blue-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">
                      {item.title}
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-slate-400">
                      {item.subtitle}
                    </div>
                  </div>
                  <span className="shrink-0 text-slate-300">→</span>
                </Link>
              ))
            ) : (
              <div className="px-4 py-5 text-center text-sm font-semibold text-slate-400">
                Không tìm thấy kết quả phù hợp.
              </div>
            )}
          </div>
        )}
      </section>

      {/* HÔM NAY */}
      <section className="ui-card overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black">🗓️ Hôm nay CLB có gì?</h2>
            <p className="mt-1 text-sm text-slate-400">
              Lịch lớp và hoạt động trong ngày
            </p>
          </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl bg-emerald-50 px-3 py-3">
                <div className="text-xs font-bold text-emerald-600">💰 Thu hôm nay</div>
                <div className="mt-1 text-sm font-black text-emerald-800">
                  {money(todayRevenue)}
                </div>
              </div>

              <div className="rounded-2xl bg-rose-50 px-3 py-3">
                <div className="text-xs font-bold text-rose-600">💸 Chi hôm nay</div>
                <div className="mt-1 text-sm font-black text-rose-800">
                  {money(todayExpenseTotal)}
                </div>
              </div>

              <div className="rounded-2xl bg-blue-50 px-3 py-3">
                <div className="text-xs font-bold text-blue-600">🧑‍🎓 HV mới</div>
                <div className="mt-1 text-sm font-black text-blue-800">
                  {todayNewStudents} học viên
                </div>
              </div>

              <div className="rounded-2xl bg-amber-50 px-3 py-3">
                <div className="text-xs font-bold text-amber-600">🧾 Giao dịch</div>
                <div className="mt-1 text-sm font-black text-amber-800">
                  {todayPaymentCount} lượt thu
                </div>
              </div>
            </div>


          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">
              📚 {todayClasses.length} lớp
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
              💰 {money(todayRevenue)}
            </span>
          </div>
        </div>

        <Link
          href="/teacher-payroll/substitution"
          className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/40 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔄</span>
            <span className="font-black text-slate-900">Duyệt GV dạy thay</span>
          </div>

          <div className="flex items-center gap-3">
            {pendingSubstitutionCount > 0 && (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-200 px-2 text-sm font-black text-amber-800">
                {pendingSubstitutionCount}
              </span>
            )}
            <span className="text-lg text-slate-300 transition group-hover:text-amber-500">
              →
            </span>
          </div>
        </Link>

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
              Đang tải lịch hôm nay...
            </div>
          ) : todayClasses.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-7 text-center">
              <div className="text-3xl">😴</div>
              <div className="mt-2 font-bold text-slate-600">
                Hôm nay không có lớp
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Một ngày khá nhẹ nhàng cho CLB 😎
              </div>
            </div>
          ) : (
            todayClasses.map((item) => (
              <Link
                key={item.id}
                href={`/branches/${item.id}`}
                className="group flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-[0_8px_20px_rgba(35,50,75,.08)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm">
                    💃
                  </div>

                  <div className="min-w-0">
                    <div className="truncate font-black text-slate-900">
                      {item.name}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                      <span>
                        ⏰{" "}
                        {item.schedule_start && item.schedule_end
                          ? `${item.schedule_start.slice(0, 5)} – ${item.schedule_end.slice(0, 5)}`
                          : "Chưa có giờ"}
                      </span>
                      <span>🏢 {item.branchName}</span>
                      <span>👥 {item.studentCount} học viên</span>
                    </div>
                  </div>
                </div>

                <span className="shrink-0 text-lg text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500">
                  →
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* PHÂN TÍCH */}
      <section className="ui-card overflow-hidden p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-black">📊 Phân tích hoạt động</h2>
          <p className="mt-1 text-sm text-slate-400">
            So sánh nhanh với tháng trước
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="text-sm font-bold text-slate-500">
              💰 Thu tháng này / tháng trước
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <div className="text-xs text-slate-400">Tháng này</div>
                <div className="mt-1 text-lg font-black text-emerald-700">
                  {money(revenue)}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <div className="text-xs text-slate-400">Tháng trước</div>
                <div className="mt-1 text-lg font-black text-slate-800">
                  {money(previousMonthRevenue)}
                </div>
              </div>
            </div>
            <div
              className={`mt-3 text-sm font-black ${
                revenueChange === null
                  ? "text-slate-500"
                  : revenueChange >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
              }`}
            >
              {revenueChange === null
                ? "Chưa đủ dữ liệu để tính % thay đổi"
                : `${revenueChange >= 0 ? "↑" : "↓"} ${Math.abs(revenueChange).toFixed(1)}% so với tháng trước`}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="text-sm font-bold text-slate-500">
              🧑‍🎓 Học viên tăng / giảm
            </div>
            <div className="mt-2 flex items-end gap-3">
              <div className="text-3xl font-black text-slate-900">
                {activeStudents}
              </div>
              <div
                className={`mb-1 text-sm font-black ${
                  studentChange > 0
                    ? "text-emerald-600"
                    : studentChange < 0
                      ? "text-rose-600"
                      : "text-slate-500"
                }`}
              >
                {studentChange > 0
                  ? `↑ ${studentChange} học viên`
                  : studentChange < 0
                    ? `↓ ${Math.abs(studentChange)} học viên`
                    : "→ Không thay đổi"}
              </div>
            </div>
            <div className="mt-1 text-xs font-medium text-slate-400">
              Hiện tại: {activeStudents} • Mốc tháng trước:{" "}
              {previousMonthActiveStudents}
            </div>
          </div>
        </div>
      </section>

      {/* SMART ALERTS */}
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-base font-black text-gray-900">
              ⚠️ Cảnh báo thông minh
            </h2>
            <p className="text-xs text-gray-500">
              Các điểm cần chú ý trong tháng này
            </p>
          </div>

          <div className="space-y-2">
            {smartAlerts.unpaidStudents > 0 && (
              <a
                href="/tuition"
                className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm hover:shadow-md"
              >
                <span className="text-sm text-gray-700">
                  ⚠️ Có{" "}
                  <b className="text-gray-900">
                    {smartAlerts.unpaidStudents}
                  </b>{" "}
                  học viên chưa hoàn tất học phí tháng này
                </span>
                <span className="shrink-0 text-xs font-semibold text-blue-600">
                  Xem →
                </span>
              </a>
            )}

            {smartAlerts.unpaidClasses.map((item) => (
              <a
                key={item.classId}
                href={`/branches/${item.classId}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm hover:shadow-md"
              >
                <span className="text-sm text-gray-700">
                  💰 <b className="text-gray-900">{item.name}</b> còn{" "}
                  <b className="text-gray-900">{item.count}</b> học viên chưa
                  đóng đủ
                </span>
                <span className="shrink-0 text-xs font-semibold text-blue-600">
                  Xem →
                </span>
              </a>
            ))}

            {smartAlerts.activeTeachersCount > 0 && (
              <a
                href="/teacher-payroll"
                className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm hover:shadow-md"
              >
                <span className="text-sm text-gray-700">
                  👨‍🏫 Đã chốt lương{" "}
                  <b className="text-gray-900">
                    {smartAlerts.payrollCompletedCount}/
                    {smartAlerts.activeTeachersCount}
                  </b>{" "}
                  giáo viên
                </span>

                <span className="shrink-0 text-xs font-semibold text-blue-600">
                  {smartAlerts.payrollPendingCount > 0
                    ? "Còn chưa chốt →"
                    : "Đã đủ ✓"}
                </span>
              </a>
            )}

            {smartAlerts.unpaidStudents === 0 &&
            smartAlerts.unpaidClasses.length === 0 &&
            smartAlerts.payrollPendingCount === 0 ? (
              <div className="rounded-xl bg-white px-3 py-3 text-center text-sm font-semibold text-emerald-600">
                ✅ Mọi thứ đang ổn
              </div>
            ) : null}
          </div>
        </section>

        {/* KPI */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: "👥",
            label: "Học viên",
            value: activeStudents,
            suffix: "đang hoạt động",
            href: "/students",
          },
          {
            icon: "📚",
            label: "Lớp học",
            value: activeClasses,
            suffix: `${branches.length} cơ sở`,
            href: "/branches",
          },
          {
            icon: "💰",
            label: "Thu tháng này",
            value: money(revenue),
            suffix: `${monthPayments.length} giao dịch`,
            href: "/tuition",
          },
          {
            icon: "💸",
            label: "Chi tháng này",
            value: money(expenseTotal),
            suffix: `${monthExpenses.length} khoản chi`,
            href: "/expenses",
          },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="group ui-card block p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_38px_rgba(35,50,75,.13)] active:translate-y-1"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-white text-2xl shadow-[0_7px_16px_rgba(35,50,75,.08)]">
                {item.icon}
              </div>

              <span className="text-xl text-slate-300 transition-transform group-hover:translate-x-1">
                →
              </span>
            </div>

            <div className="mt-5 text-sm font-semibold text-slate-500">
              {item.label}
            </div>

            <div className="mt-1 truncate text-2xl font-black tracking-tight text-slate-900">
              {loading ? "—" : item.value}
            </div>

            <div className="mt-1 text-xs font-medium text-slate-400">
              {item.suffix}
            </div>
          </Link>
        ))}
      </section>

      {/* PROFIT */}
      <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="ui-card overflow-hidden p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">💵 Tình hình tài chính</h2>
              <p className="mt-1 text-sm text-slate-400">
                Thu − Chi = Còn lại
              </p>
            </div>

            <Link
              href="/reports"
              className="ui-btn ui-btn-light px-4 text-sm"
            >
              Xem báo cáo →
            </Link>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-5 shadow-[inset_0_1px_0_white,0_7px_18px_rgba(35,50,75,.05)]">
              <div className="text-sm font-semibold text-slate-500">Tổng thu</div>
              <div className="mt-2 text-xl font-black text-emerald-700">
                {loading ? "—" : money(revenue)}
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-white p-5 shadow-[inset_0_1px_0_white,0_7px_18px_rgba(35,50,75,.05)]">
              <div className="text-sm font-semibold text-slate-500">Tổng chi</div>
              <div className="mt-2 text-xl font-black text-rose-700">
                {loading ? "—" : money(expenseTotal)}
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-white p-5 shadow-[inset_0_1px_0_white,0_7px_18px_rgba(35,50,75,.05)]">
              <div className="text-sm font-semibold text-slate-500">
                Còn lại
              </div>
              <div
                className={`mt-2 text-xl font-black ${
                  balance >= 0 ? "text-blue-700" : "text-rose-700"
                }`}
              >
                {loading ? "—" : money(balance)}
              </div>
            </div>
          </div>
        </div>

        {/* BRANCH */}
        <div className="ui-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">🏢 Cơ sở</h2>
              <p className="mt-1 text-sm text-slate-400">
                Phân bổ lớp đang hoạt động
              </p>
            </div>

            <Link
              href="/branches"
              className="text-sm font-bold text-blue-600 hover:underline"
            >
              Quản lý →
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="py-5 text-sm text-slate-400">Đang tải...</div>
            ) : branchStats.length === 0 ? (
              <div className="py-5 text-sm text-slate-400">
                Chưa có cơ sở.
              </div>
            ) : (
              branchStats.map((branch) => (
                <Link
                  key={branch.id}
                  href="/branches"
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_6px_15px_rgba(35,50,75,.06)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(35,50,75,.09)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                      🏢
                    </div>
                    <span className="font-bold">{branch.name}</span>
                  </div>

                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    {branch.classes} lớp
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* RECENT ACTIVITY */}
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="ui-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">💰 Thu học phí gần đây</h2>
              <p className="mt-1 text-sm text-slate-400">
                Các giao dịch mới nhất trong tháng
              </p>
            </div>

            <Link
              href="/tuition"
              className="text-sm font-bold text-blue-600 hover:underline"
            >
              Xem tất cả →
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="py-5 text-center text-sm text-slate-400">
                Đang tải...
              </div>
            ) : recentPayments.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 py-8 text-center text-sm text-slate-400">
                Chưa có giao dịch trong tháng này.
              </div>
            ) : (
              recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-[0_5px_15px_rgba(35,50,75,.05)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                      💵
                    </div>
                    <div>
                      <div className="text-sm font-bold">
                        Thu học phí
                      </div>
                      <div className="text-xs text-slate-400">
                        {dateVN(payment.payment_date)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-black text-emerald-700">
                      +{money(Number(payment.amount))}
                    </div>
                    <div className="text-xs text-slate-400">
                      {payment.payment_method === "transfer"
                        ? "Chuyển khoản"
                        : payment.payment_method === "cash"
                          ? "Tiền mặt"
                          : "Chưa phân loại"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="ui-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">💸 Chi phí gần đây</h2>
              <p className="mt-1 text-sm text-slate-400">
                Các khoản chi mới nhất trong tháng
              </p>
            </div>

            <Link
              href="/expenses"
              className="text-sm font-bold text-blue-600 hover:underline"
            >
              Xem tất cả →
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="py-5 text-center text-sm text-slate-400">
                Đang tải...
              </div>
            ) : recentExpenses.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 py-8 text-center text-sm text-slate-400">
                Chưa có khoản chi trong tháng này.
              </div>
            ) : (
              recentExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-[0_5px_15px_rgba(35,50,75,.05)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50">
                      💸
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">
                        {expense.description ||
                          categoryLabel[expense.category] ||
                          "Chi phí"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {categoryLabel[expense.category] || expense.category}{" "}
                        • {dateVN(expense.expense_date)}
                      </div>
                    </div>
                  </div>

                  <div className="ml-3 shrink-0 text-right font-black text-rose-700">
                    -{money(Number(expense.amount))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-black">⚡ Thao tác nhanh</h2>
          <p className="mt-1 text-sm text-slate-400">
            Những việc thường dùng nhất
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["👥", "Thêm học viên", "/students"],
            ["📚", "Thêm lớp", "/branches"],
            ["💰", "Thu học phí", "/tuition"],
            ["💸", "Thêm chi phí", "/expenses"],
          ].map(([icon, label, href]) => (
            <Link
              key={label}
              href={href}
              className="ui-btn ui-btn-light flex min-h-[58px] items-center justify-center gap-3 text-sm"
            >
              <span className="text-xl">{icon}</span>
              {label}
            </Link>
          ))}
        </div>
      </section>
      </div>
    </>
  );
}
