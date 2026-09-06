"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Student = {
  id: string;
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

type Expense = {
  id: string;
  amount: number;
  expense_date: string;
  category: string;
  description: string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + " đ";

const dateVN = (value: string) =>
  new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const categoryLabel: Record<string, string> = {
  rent: "Thuê mặt bằng",
  salary: "Lương",
  utilities: "Điện nước",
  equipment: "Thiết bị",
  marketing: "Marketing",
  other: "Khác",
};

export default function DashboardPage() {
  const supabase = createClient();

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const [studentsRes, classesRes, branchesRes, paymentsRes, expensesRes] =
      await Promise.all([
        supabase
          .from("students")
          .select("id,full_name,status,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("classes")
          .select("id,name,branch_id,status,monthly_fee")
          .order("name"),
        supabase
          .from("branches")
          .select("id,name")
          .order("name"),
        supabase
          .from("tuition_payments")
          .select("id,amount,payment_date,payment_method")
          .order("payment_date", { ascending: false })
          .limit(100),
        supabase
          .from("expenses")
          .select("id,amount,expense_date,category,description")
          .order("expense_date", { ascending: false })
          .limit(100),
      ]);

    if (studentsRes.error) console.error(studentsRes.error);
    if (classesRes.error) console.error(classesRes.error);
    if (branchesRes.error) console.error(branchesRes.error);
    if (paymentsRes.error) console.error(paymentsRes.error);
    if (expensesRes.error) console.error(expensesRes.error);

    setStudents(studentsRes.data ?? []);
    setClasses(classesRes.data ?? []);
    setBranches(branchesRes.data ?? []);
    setPayments(paymentsRes.data ?? []);
    setExpenses(expensesRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthPayments = useMemo(
    () =>
      payments.filter((item) => {
        const d = new Date(item.payment_date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }),
    [payments, currentMonth, currentYear]
  );

  const monthExpenses = useMemo(
    () =>
      expenses.filter((item) => {
        const d = new Date(item.expense_date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }),
    [expenses, currentMonth, currentYear]
  );

  const revenue = monthPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = monthExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const balance = revenue - expenseTotal;

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

  return (
    <div className="space-y-7">
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
            {now.toLocaleDateString("vi-VN")}
          </div>
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
  );
}
