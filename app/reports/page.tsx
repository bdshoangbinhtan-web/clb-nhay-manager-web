"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { filterEffectiveSources } from "@/lib/finance/ledger";
import { isVoidedDuplicateTuition, linkedTuition, sumAdvanceTuitionCollected, sumTuitionByBillingPeriod } from "@/lib/finance/tuition-period";
import type { TuitionRelation } from "@/lib/finance/tuition-period";
import { vietnamCurrentMonth, toVietnamDateKey } from "@/lib/vietnam-date";
import { useRealtimeRefresh } from "@/components/realtime/global-realtime-provider";

type Branch = { id: string; name: string };

type Payment = {
  id: string;
  amount: number;
  payment_method: string | null;
  transfer_account: "H" | "A" | "S" | "V" | null;
  payment_date: string | null;
  tuition: TuitionRelation | TuitionRelation[] | null;
};

type Expense = {
  id: string;
  branch_id: string | null;
  expense_date: string;
  category: string;
  amount: number;
};

type OtherRevenue = {
  id: string;
  revenue_date: string;
  category: string;
  amount: number;
  branch_id: string | null;
};

type Adjustment = {
  id: string;
  amount: number;
  action: "reserve" | "refund" | "carry_forward" | "cancel" | "none";
  created_at: string;
  tuition: TuitionRelation | TuitionRelation[] | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  rent: "🏠 Thuê mặt bằng",
  salary: "👤 Lương",
  utilities: "⚡ Điện nước",
  equipment: "💻 Thiết bị",
  marketing: "📣 Marketing",
  other: "📦 Khác",
};

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

function monthName(month: string) {
  if (!month) return "";
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

function reportPeriodRange(mode: "month" | "year", period: string) {
  if (mode === "year") {
    const year = Number(period);
    if (!/^\d{4}$/.test(period) || !Number.isFinite(year)) return null;

    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;

    return {
      start,
      end,
      timestampStart: new Date(`${start}T00:00:00+07:00`).toISOString(),
      timestampEnd: new Date(`${end}T00:00:00+07:00`).toISOString(),
    };
  }

  if (!/^\d{4}-\d{2}$/.test(period)) return null;

  const [year, month] = period.split("-").map(Number);
  if (month < 1 || month > 12) return null;

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const start = `${period}-01`;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  return {
    start,
    end,
    timestampStart: new Date(`${start}T00:00:00+07:00`).toISOString(),
    timestampEnd: new Date(`${end}T00:00:00+07:00`).toISOString(),
  };
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const loadRequestRef = useRef(0);

  const [mode, setMode] = useState<"month" | "year">("month");
  const [period, setPeriod] = useState(vietnamCurrentMonth());
  const [branchFilter, setBranchFilter] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [periodPayments, setPeriodPayments] = useState<Payment[]>([]);
  const [periodRefunds, setPeriodRefunds] = useState<Adjustment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [otherRevenues, setOtherRevenues] = useState<OtherRevenue[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransferBreakdown, setShowTransferBreakdown] = useState(false);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const range = reportPeriodRange(mode, period);

    if (!range) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [
      { data: branchData, error: branchError },
      { data: paymentData, error: paymentError },
      { data: periodPaymentData, error: periodPaymentError },
      { data: periodRefundData, error: periodRefundError },
      { data: expenseData, error: expenseError },
      { data: adjustmentData, error: adjustmentError },
      { data: otherRevenueData, error: otherRevenueError },
      { data: sourceReversalData, error: sourceReversalError },
    ] = await Promise.all([
      supabase.from("branches").select("id,name").order("name"),

      supabase
        .from("tuition_payments")
        .select(`
          id,
          amount,
          payment_method,
          transfer_account,
          payment_date,
          tuition:tuition_id (
            branch_id,
            billing_month,
            note
          )
        `)
        .gte("payment_date", range.start)
        .lt("payment_date", range.end),

      // Tuition assigned to the selected lesson period, independently of payment date.
      supabase
        .from("tuition_payments")
        .select("id,amount,payment_date,tuition:tuition_id!inner(branch_id,billing_month,note)")
        .gte("tuition.billing_month", range.start)
        .lt("tuition.billing_month", range.end),

      // Period refunds reverse the original lesson period, not the refund date.
      supabase
        .from("tuition_adjustments")
        .select("id,amount,action,created_at,tuition:tuition_id!inner(branch_id,billing_month,note)")
        .eq("action", "refund")
        .gte("tuition.billing_month", range.start)
        .lt("tuition.billing_month", range.end),

      supabase
        .from("expenses")
        .select("id,branch_id,expense_date,category,amount")
        .gte("expense_date", range.start)
        .lt("expense_date", range.end),

      supabase
        .from("tuition_adjustments")
        .select(`
          id,
          amount,
          action,
          created_at,
          tuition:tuition_id (
            branch_id,
            billing_month,
            note
          )
        `)
        .eq("action", "refund")
        .gte("created_at", range.timestampStart)
        .lt("created_at", range.timestampEnd),

      supabase
        .from("other_revenues")
        .select("id,revenue_date,category,amount,branch_id")
        .gte("revenue_date", range.start)
        .lt("revenue_date", range.end)
        .order("revenue_date", { ascending: false }),

      supabase.from("finance_source_reversals").select("source_type,source_id").in("source_type", ["expense", "other_revenue"]),
    ]);

    if (requestId !== loadRequestRef.current) return;

    if (branchError) {
      alert(branchError.message);
      setLoading(false);
      return;
    }

    if (paymentError) {
      alert(paymentError.message);
      setLoading(false);
      return;
    }

    if (periodPaymentError || periodRefundError) {
      alert((periodPaymentError || periodRefundError)?.message ?? "Không thể tải doanh thu theo kỳ học.");
      setLoading(false);
      return;
    }

    if (expenseError) {
      alert(expenseError.message);
      setLoading(false);
      return;
    }

    if (adjustmentError) {
      alert(adjustmentError.message);
      setLoading(false);
      return;
    }

    if (otherRevenueError) {
      alert(otherRevenueError.message);
      setLoading(false);
      return;
    }

    if (sourceReversalError) {
      alert(sourceReversalError.message);
      setLoading(false);
      return;
    }

    setBranches(branchData ?? []);
    // Void duplicate payments remain in the audit log but never inflate totals.
    setPayments(((paymentData ?? []) as unknown as Payment[]).filter((item) => !isVoidedDuplicateTuition(item)));
    setPeriodPayments(((periodPaymentData ?? []) as unknown as Payment[]).filter((item) => !isVoidedDuplicateTuition(item)));
    setPeriodRefunds(((periodRefundData ?? []) as unknown as Adjustment[]).filter((item) => !isVoidedDuplicateTuition(item)));
    setExpenses(filterEffectiveSources("expense", expenseData ?? [], sourceReversalData ?? []));
    setOtherRevenues(filterEffectiveSources("other_revenue", (otherRevenueData ?? []) as OtherRevenue[], sourceReversalData ?? []));
    setAdjustments((adjustmentData ?? []) as unknown as Adjustment[]);
    setLoading(false);
  }, [mode, period, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useRealtimeRefresh(["reports"], loadData);

  const paymentInPeriod = useCallback((item: Payment) => {
    if (!item.payment_date) return false;

    const date = item.payment_date.slice(0, 10);

    if (mode === "month") {
      return date.startsWith(period);
    }

    return date.startsWith(period.slice(0, 4));
  }, [mode, period]);

  const expenseInPeriod = useCallback((item: Expense) => {
    if (mode === "month") {
      return item.expense_date.startsWith(period);
    }

    return item.expense_date.startsWith(period.slice(0, 4));
  }, [mode, period]);

  const adjustmentInPeriod = useCallback((item: Adjustment) => {
    // created_at là timestamptz: quy về ngày Việt Nam trước khi lọc kỳ.
    const date = toVietnamDateKey(item.created_at);

    if (mode === "month") {
      return date.startsWith(period);
    }

    return date.startsWith(period.slice(0, 4));
  }, [mode, period]);

  const filteredPayments = useMemo(() => {
    return payments.filter((item) => {
      if (!paymentInPeriod(item)) return false;

      if (
        branchFilter &&
        linkedTuition(item)?.branch_id !== branchFilter
      ) {
        return false;
      }

      return true;
    });
  }, [payments, branchFilter, paymentInPeriod]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      if (!expenseInPeriod(item)) return false;

      if (branchFilter && item.branch_id !== branchFilter) {
        return false;
      }

      return true;
    });
  }, [expenses, branchFilter, expenseInPeriod]);

  const filteredRefunds = useMemo(() => {
    return adjustments.filter((item) => {
      if (!adjustmentInPeriod(item)) return false;

      if (branchFilter && linkedTuition(item)?.branch_id !== branchFilter) {
        return false;
      }

      return true;
    });
  }, [adjustments, branchFilter, adjustmentInPeriod]);

  const filteredOtherRevenues = useMemo(() => {
    return otherRevenues.filter((item) => {
      const inPeriod = mode === "month"
        ? item.revenue_date.startsWith(period)
        : item.revenue_date.startsWith(period.slice(0, 4));
      if (!inPeriod) return false;
      if (branchFilter && item.branch_id !== branchFilter) return false;
      return true;
    });
  }, [otherRevenues, period, mode, branchFilter]);

  const tuitionThu = filteredPayments.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );
  const otherThu = filteredOtherRevenues.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );
  const totalThu = tuitionThu + otherThu;

  const totalRefund = filteredRefunds.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const totalChi = filteredExpenses.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const netCashIn = totalThu - totalRefund;
  const remaining = netCashIn - totalChi;
  // Collected tuition assigned by billing_month; unpaid tuition remains a separate receivable.
  const periodTuitionThu = sumTuitionByBillingPeriod(periodPayments, period, branchFilter);
  const periodTuitionRefund = sumTuitionByBillingPeriod(periodRefunds, period, branchFilter);
  const periodRevenue = periodTuitionThu - periodTuitionRefund + otherThu;
  const advanceCollected = sumAdvanceTuitionCollected(filteredPayments, period);

  const cash = filteredPayments
    .filter((item) => item.payment_method === "cash")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const transfer = filteredPayments
    .filter((item) => item.payment_method === "transfer")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const transferBreakdown = (["H", "A", "S", "V"] as const).map((account) => ({
    account,
    amount: filteredPayments.filter((item) => item.payment_method === "transfer" && (item.transfer_account ?? "H") === account)
      .reduce((sum, item) => sum + Number(item.amount), 0),
  }));

  const unclassified = filteredPayments
    .filter(
      (item) =>
        !item.payment_method ||
        item.payment_method === "unclassified"
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const expenseByCategory = useMemo(() => {
    const result: Record<string, number> = {};

    for (const item of filteredExpenses) {
      result[item.category] =
        (result[item.category] ?? 0) + Number(item.amount);
    }

    return Object.entries(result).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses]);

  const branchSummary = useMemo(() => {
    return branches
      .map((branch) => {
        const tuitionThu = payments
          .filter(
            (item) =>
              paymentInPeriod(item) &&
              linkedTuition(item)?.branch_id === branch.id
          )
          .reduce((sum, item) => sum + Number(item.amount), 0);

        const otherThu = otherRevenues
          .filter((item) => {
            const inPeriod =
              mode === "month"
                ? item.revenue_date.startsWith(period)
                : item.revenue_date.startsWith(period.slice(0, 4));

            return inPeriod && item.branch_id === branch.id;
          })
          .reduce((sum, item) => sum + Number(item.amount), 0);

        const thu = tuitionThu + otherThu;
        const earned = sumTuitionByBillingPeriod(periodPayments, period, branch.id)
          - sumTuitionByBillingPeriod(periodRefunds, period, branch.id) + otherThu;
        const advance = sumAdvanceTuitionCollected(payments, period, branch.id);

        const refund = adjustments
          .filter(
            (item) =>
              adjustmentInPeriod(item) &&
              linkedTuition(item)?.branch_id === branch.id
          )
          .reduce((sum, item) => sum + Number(item.amount), 0);

        const chi = expenses
          .filter(
            (item) =>
              expenseInPeriod(item) &&
              item.branch_id === branch.id
          )
          .reduce((sum, item) => sum + Number(item.amount), 0);

        return {
          ...branch,
          thu,
          earned,
          advance,
          otherThu,
          refund,
          chi,
          remaining: thu - refund - chi,
        };
      })
      .filter(
        (item) => item.thu !== 0 || item.earned !== 0 || item.refund !== 0 || item.chi !== 0
      );
  }, [
    branches,
    payments,
    periodPayments,
    periodRefunds,
    otherRevenues,
    adjustments,
    expenses,
    period,
    mode,
    paymentInPeriod,
    adjustmentInPeriod,
    expenseInPeriod,
  ]);

  const unassignedTuitionThu = payments
    .filter(
      (item) =>
        paymentInPeriod(item) && !linkedTuition(item)?.branch_id
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const unassignedOtherThu = otherRevenues
    .filter((item) => {
      const inPeriod =
        mode === "month"
          ? item.revenue_date.startsWith(period)
          : item.revenue_date.startsWith(period.slice(0, 4));

      return inPeriod && !item.branch_id;
    })
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const unassignedThu =
    unassignedTuitionThu + unassignedOtherThu;
  const unassignedEarned = sumTuitionByBillingPeriod(periodPayments.filter((item) => !linkedTuition(item)?.branch_id), period)
    - sumTuitionByBillingPeriod(periodRefunds.filter((item) => !linkedTuition(item)?.branch_id), period) + unassignedOtherThu;
  const unassignedAdvance = sumAdvanceTuitionCollected(payments.filter((item) => !linkedTuition(item)?.branch_id), period);

  const unassignedChi = expenses
    .filter(
      (item) => expenseInPeriod(item) && !item.branch_id
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const unassignedRefund = adjustments
    .filter(
      (item) => adjustmentInPeriod(item) && !linkedTuition(item)?.branch_id
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);

  function shiftPeriod(direction: number) {
    if (mode === "year") {
      const year = Number(period) + direction;
      setPeriod(String(year));
      return;
    }

    const [year, month] = period.split("-").map(Number);
    const date = new Date(year, month - 1 + direction, 1);

    setPeriod(
      `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`
    );
  }

  const displayPeriod =
    mode === "year" ? period : monthName(period);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-blue-600">
            TÀI CHÍNH
          </div>

          <h1 className="mt-1 text-4xl font-black tracking-tight">
            📊 Báo cáo
          </h1>

          <p className="mt-2 text-slate-400">
            Tách tiền thực thu theo ngày với doanh thu học phí theo kỳ học (số đã thu); công nợ theo dõi riêng
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={`ui-btn ${
              mode === "month"
                ? "bg-slate-900 text-white"
                : ""
            }`}
            onClick={() => {
              setMode("month");
              if (period.length === 4) {
                setPeriod(
                  `${period}-${vietnamCurrentMonth().slice(5, 7)}`
                );
              }
            }}
          >
            Theo tháng
          </button>

          <button
            className={`ui-btn ${
              mode === "year"
                ? "bg-slate-900 text-white"
                : ""
            }`}
            onClick={() => {
              setMode("year");
              setPeriod(period.slice(0, 4));
            }}
          >
            Theo năm
          </button>
        </div>
      </section>

      <section className="ui-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <button className="ui-btn" onClick={() => shiftPeriod(-1)}>
              ←
            </button>

            {mode === "month" ? (
              <input
                type="month"
                className="ui-input min-w-[180px]"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            ) : (
              <input
                type="number"
                className="ui-input w-[140px]"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            )}

            <button className="ui-btn" onClick={() => shiftPeriod(1)}>
              →
            </button>

            <span className="ml-2 font-black">
              {displayPeriod}
            </span>
          </div>

          <select
            className="ui-input lg:w-[240px]"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">🏢 Toàn CLB</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading ? (
        <div className="ui-card p-12 text-center text-slate-400">
          Đang tải báo cáo...
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <div className="ui-card p-6">
              <div className="text-sm font-bold text-slate-400">
                💰 TIỀN THỰC THU
              </div>
              <div className="mt-2 text-3xl font-black text-emerald-600">
                {money(totalThu)}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {filteredPayments.length} giao dịch
              </div>
            </div>

            <div className="ui-card p-6">
              <div className="text-sm font-bold text-slate-400">
                💸 HOÀN TIỀN THỰC TẾ
              </div>
              <div className="mt-2 text-3xl font-black text-amber-600">
                {money(totalRefund)}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {filteredRefunds.length} khoản hoàn
              </div>
            </div>

            <div className="ui-card p-6">
              <div className="text-sm font-bold text-slate-400">
                💼 THU RÒNG (DÒNG TIỀN)
              </div>
              <div className="mt-2 text-3xl font-black text-blue-600">
                {money(netCashIn)}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                Thực thu − Hoàn tiền thực tế
              </div>
            </div>

            <div className="ui-card p-6">
              <div className="text-sm font-bold text-slate-400">📆 DOANH THU THEO KỲ HỌC</div>
              <div className="mt-2 text-3xl font-black text-indigo-700">{money(periodRevenue)}</div>
              <div className="mt-2 text-sm text-slate-400">Học phí đã thu theo tháng học − hoàn theo kỳ + thu khác</div>
            </div>

            <div className="ui-card p-6">
              <div className="text-sm font-bold text-slate-400">⏭ THU TRƯỚC KỲ SAU</div>
              <div className="mt-2 text-3xl font-black text-cyan-700">{money(advanceCollected)}</div>
              <div className="mt-2 text-sm text-slate-400">Đã nằm trong thực thu, chưa tính vào doanh thu kỳ đang xem</div>
            </div>

            <div className="ui-card p-6">
              <div className="text-sm font-bold text-slate-400">
                💸 TỔNG CHI
              </div>
              <div className="mt-2 text-3xl font-black text-rose-500">
                {money(totalChi)}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {filteredExpenses.length} khoản chi
              </div>
            </div>

            <div className="ui-card p-6">
              <div className="text-sm font-bold text-slate-400">
                📈 CÒN LẠI (DÒNG TIỀN)
              </div>
              <div
                className={`mt-2 text-3xl font-black ${
                  remaining >= 0
                    ? "text-blue-600"
                    : "text-rose-600"
                }`}
              >
                {money(remaining)}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                Thu ròng − Chi
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="ui-card p-6">
              <h2 className="text-xl font-black">
                💳 Phân bổ tiền thu
              </h2>

              <div className="mt-5 space-y-3">
                <div className="flex justify-between rounded-xl bg-slate-50 p-4">
                  <span>💵 Tiền mặt</span>
                  <strong>{money(cash)}</strong>
                </div>

                <button type="button" className="flex w-full justify-between rounded-xl bg-slate-50 p-4 text-left" aria-expanded={showTransferBreakdown} onClick={() => setShowTransferBreakdown((value) => !value)}>
                  <span>🏦 Chuyển khoản</span><strong>{money(transfer)}</strong>
                </button>
                {showTransferBreakdown && <div className="grid gap-2 sm:grid-cols-2">
                  {transferBreakdown.map((item) => <div key={item.account} className="flex justify-between rounded-xl bg-blue-50 p-3"><span>{item.account}</span><strong>{money(item.amount)}</strong></div>)}
                </div>}

                <div className="flex justify-between rounded-xl bg-slate-50 p-4">
                  <span>⚪ Chưa phân loại</span>
                  <strong>{money(unclassified)}</strong>
                </div>
              </div>
            </div>

            <div className="ui-card p-6">
              <h2 className="text-xl font-black">
                💸 Chi theo nhóm
              </h2>

              {expenseByCategory.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  Chưa có dữ liệu chi.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {expenseByCategory.map(([category, amount]) => (
                    <div
                      key={category}
                      className="flex justify-between rounded-xl bg-slate-50 p-4"
                    >
                      <span>
                        {CATEGORY_LABELS[category] ?? category}
                      </span>
                      <strong>{money(amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="ui-card overflow-hidden">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-xl font-black">
                🏢 Tổng hợp theo cơ sở
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Thực thu − hoàn tiền − chi = dòng tiền còn lại; doanh thu theo kỳ được tính riêng
              </p>
            </div>

            {branchSummary.length === 0 &&
            unassignedThu === 0 &&
            unassignedEarned === 0 &&
            unassignedChi === 0 ? (
              <div className="p-10 text-center text-slate-400">
                Chưa có dữ liệu trong kỳ này.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-sm text-slate-400">
                      <th className="p-4">Cơ sở</th>
                      <th className="p-4 text-right">Thực thu</th>
                      <th className="p-4 text-right">Theo kỳ học</th>
                      <th className="p-4 text-right">Thu trước</th>
                      <th className="p-4 text-right">Thu khác</th>
                      <th className="p-4 text-right">Hoàn</th>
                      <th className="p-4 text-right">Chi</th>
                      <th className="p-4 text-right">
                        Còn lại
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {branchSummary.map((branch) => (
                      <tr
                        key={branch.id}
                        className="border-b border-slate-50"
                      >
                        <td className="p-4 font-bold">
                          {branch.name}
                        </td>

                        <td className="p-4 text-right font-bold text-emerald-600">
                          {money(branch.thu)}
                        </td>
                        <td className="p-4 text-right font-bold text-indigo-700">{money(branch.earned)}</td>
                        <td className="p-4 text-right font-bold text-cyan-700">{money(branch.advance)}</td>

                        <td className="p-4 text-right font-bold text-cyan-600">
                          {money(branch.otherThu)}
                        </td>

                        <td className="p-4 text-right font-bold text-amber-600">
                          {money(branch.refund)}
                        </td>

                        <td className="p-4 text-right font-bold text-rose-500">
                          {money(branch.chi)}
                        </td>

                        <td
                          className={`p-4 text-right font-black ${
                            branch.remaining >= 0
                              ? "text-blue-600"
                              : "text-rose-600"
                          }`}
                        >
                          {money(branch.remaining)}
                        </td>
                      </tr>
                    ))}

                    {(unassignedThu !== 0 ||
                      unassignedEarned !== 0 ||
                      unassignedRefund > 0 ||
                      unassignedChi > 0) && (
                      <tr className="border-b border-slate-50 bg-slate-50">
                        <td className="p-4 font-bold">
                          ⚪ Chưa gán cơ sở
                        </td>

                        <td className="p-4 text-right font-bold text-emerald-600">
                          {money(unassignedThu)}
                        </td>
                        <td className="p-4 text-right font-bold text-indigo-700">{money(unassignedEarned)}</td>
                        <td className="p-4 text-right font-bold text-cyan-700">{money(unassignedAdvance)}</td>

                        <td className="p-4 text-right font-bold text-cyan-600">
                          {money(unassignedOtherThu)}
                        </td>

                        <td className="p-4 text-right font-bold text-amber-600">
                          {money(unassignedRefund)}
                        </td>

                        <td className="p-4 text-right font-bold text-rose-500">
                          {money(unassignedChi)}
                        </td>

                        <td className="p-4 text-right font-black">
                          {money(unassignedThu - unassignedRefund - unassignedChi)}
                        </td>
                      </tr>
                    )}
                  </tbody>

                  <tfoot>
                    <tr className="bg-slate-50">
                      <td className="p-4 font-black">
                        TOÀN CLB
                      </td>

                      <td className="p-4 text-right font-black text-emerald-600">
                        {money(totalThu)}
                      </td>
                      <td className="p-4 text-right font-black text-indigo-700">{money(periodRevenue)}</td>
                      <td className="p-4 text-right font-black text-cyan-700">{money(advanceCollected)}</td>

                      <td className="p-4 text-right font-black text-cyan-600">
                        {money(otherThu)}
                      </td>

                      <td className="p-4 text-right font-black text-amber-600">
                        {money(totalRefund)}
                      </td>

                      <td className="p-4 text-right font-black text-rose-500">
                        {money(totalChi)}
                      </td>

                      <td
                        className={`p-4 text-right text-lg font-black ${
                          remaining >= 0
                            ? "text-blue-600"
                            : "text-rose-600"
                        }`}
                      >
                        {money(remaining)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
