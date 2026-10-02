"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeRefresh } from "@/components/realtime/global-realtime-provider";
import { buildTransferLedgerSourceBatches, excludeReversedPrivacySources, filterPrivacyTransactions, matchedTransferRefundBatchIds, resolveTransferLedgerRows, summarizePrivacyTransactions, summarizeTransferAccounts, type PrivacyLedgerRow, type PrivacyTransaction } from "@/lib/privacy-view";
import { toVietnamDateKey, vietnamCurrentMonth, vietnamToday } from "@/lib/vietnam-date";
import { usePrivacyView } from "./privacy-view-context";

type TuitionRef = { student_id: string; class_id: string | null; branch_id: string | null; billing_month: string };
type PaymentRow = { id: string; amount: number; payment_method: string | null; transfer_account: string | null; payment_date: string; tuition: TuitionRef | TuitionRef[] | null };
type RefundRow = { id: string; refund_batch_id: string | null; amount: number; refund_payment_method: string | null; created_at: string; tuition: TuitionRef | TuitionRef[] | null };
type ExpenseRow = { id: string; amount: number; payment_method: string | null; transfer_account: string | null; expense_date: string; description: string; branch_id: string | null };
type RevenueRow = { id: string; amount: number; payment_method: string | null; transfer_account: string | null; revenue_date: string; description: string; branch_id: string | null };
type ReversalRow = { source_type: string; source_id: string };
type Student = { id: string; student_code: string; full_name: string; status: string | null };
type DanceClass = { id: string; name: string; branch_id: string; status: string };
type Branch = { id: string; name: string };
type PageResult<T> = { data: T[] | null; error: { message: string } | null };

const PAGE_SIZE = 500;
const money = (amount: number) => new Intl.NumberFormat("vi-VN").format(amount) + " đ";
const tuitionRef = (value: TuitionRef | TuitionRef[] | null) => Array.isArray(value) ? value[0] : value;

function nextMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function readAll<T>(page: (from: number, to: number) => Promise<PageResult<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await page(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

function transactionRows(
  payments: PaymentRow[], refunds: RefundRow[], expenses: ExpenseRow[],
  revenues: RevenueRow[], reversals: ReversalRow[],
): PrivacyTransaction[] {
  const rows: PrivacyTransaction[] = [];
  for (const payment of payments) {
    const tuition = tuitionRef(payment.tuition);
    if (!tuition) continue;
    rows.push({ id: payment.id, sourceType: "tuition_payment", paymentMethod: payment.payment_method, transferAccount: payment.transfer_account,
      date: payment.payment_date, amount: Number(payment.amount), direction: "in", branchId: tuition.branch_id,
      studentId: tuition.student_id, classId: tuition.class_id, description: "Thu học phí" });
  }
  for (const refund of refunds) {
    const tuition = tuitionRef(refund.tuition);
    if (!tuition) continue;
    rows.push({ id: refund.id, sourceType: "tuition_refund", paymentMethod: refund.refund_payment_method,
      date: toVietnamDateKey(refund.created_at), amount: Number(refund.amount), direction: "out", branchId: tuition.branch_id,
      studentId: tuition.student_id, classId: tuition.class_id, description: "Hoàn học phí" });
  }
  for (const expense of expenses) {
    rows.push({ id: expense.id, sourceType: "expense", paymentMethod: expense.payment_method, transferAccount: expense.transfer_account,
      date: expense.expense_date, amount: Number(expense.amount), direction: "out", branchId: expense.branch_id,
      studentId: null, classId: null, description: expense.description });
  }
  for (const revenue of revenues) {
    rows.push({ id: revenue.id, sourceType: "other_revenue", paymentMethod: revenue.payment_method, transferAccount: revenue.transfer_account,
      date: revenue.revenue_date, amount: Number(revenue.amount), direction: "in", branchId: revenue.branch_id,
      studentId: null, classId: null, description: revenue.description });
  }
  return excludeReversedPrivacySources(rows, reversals).sort((a, b) => b.date.localeCompare(a.date));
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="ui-card p-4 sm:p-5"><div className="text-sm font-bold text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-slate-900">{value}</div></div>;
}

function TransactionList({ rows, students, classes }: { rows: PrivacyTransaction[]; students: Map<string, Student>; classes: Map<string, DanceClass> }) {
  return <section className="ui-card overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black">Giao dịch</h2></div>
    {rows.length === 0 ? <p className="p-6 text-sm text-slate-500">Không có giao dịch trong khoảng thời gian này.</p> :
      <div className="divide-y divide-slate-100">{rows.map((row) => <div key={`${row.sourceType}:${row.id}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="font-bold">{row.description}{row.studentId && students.has(row.studentId) ? ` · ${students.get(row.studentId)?.full_name}` : ""}</div>
          <div className="mt-1 text-xs text-slate-500">{row.date}{row.classId && classes.has(row.classId) ? ` · ${classes.get(row.classId)?.name}` : ""}</div></div>
        <strong className={row.direction === "in" ? "text-emerald-700" : "text-rose-700"}>{row.direction === "in" ? "+" : "−"}{money(row.amount)}</strong>
      </div>)}</div>}
  </section>;
}

export default function PrivacyWorkspace() {
  const pathname = usePathname();
  const { role, branchId } = usePrivacyView();
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(vietnamCurrentMonth);
  const [date, setDate] = useState(vietnamToday);
  const [branchFilter, setBranchFilter] = useState("");
  const [transactions, setTransactions] = useState<PrivacyTransaction[]>([]);
  const [financeTransactions, setFinanceTransactions] = useState<PrivacyTransaction[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [showTransferBreakdown, setShowTransferBreakdown] = useState(false);
  const isFinance = pathname === "/finance";
  const startDate = isFinance ? date : `${month}-01`;
  const endDate = isFinance ? new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : `${nextMonth(month)}-01`;
  useRealtimeRefresh(["finance", "tuition", "students", "branches"], () => setRevision((current) => current + 1));

  useEffect(() => {
    let active = true;
    const start = startDate;
    const end = endDate;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        if (role === "manager" && !branchId) {
          if (active) { setTransactions([]); setFinanceTransactions([]); setStudents([]); setClasses([]); setBranches([]); setLoading(false); }
          return;
        }
        const [payments, refunds, expenses, revenues, branchesResult, classesResult] = await Promise.all([
          readAll<PaymentRow>(async (from, to) => {
            let query = supabase.from("tuition_payments")
              .select("id,amount,payment_method,transfer_account,payment_date,tuition:tuition_id!inner(student_id,class_id,branch_id,billing_month)")
              .eq("payment_method", "transfer").gte("payment_date", start).lt("payment_date", end)
              .order("payment_date", { ascending: false }).order("id");
            if (role === "manager" && branchId) query = query.eq("tuition.branch_id", branchId);
            const result = await query.range(from, to);
            return { data: result.data as unknown as PaymentRow[] | null, error: result.error };
          }),
          readAll<RefundRow>(async (from, to) => {
            let query = supabase.from("tuition_adjustments")
              .select("id,refund_batch_id,amount,refund_payment_method,created_at,tuition:tuition_id!inner(student_id,class_id,branch_id,billing_month)")
              .eq("action", "refund").eq("refund_payment_method", "transfer")
              .gte("created_at", `${start}T00:00:00+07:00`).lt("created_at", `${end}T00:00:00+07:00`)
              .order("created_at", { ascending: false }).order("id");
            if (role === "manager" && branchId) query = query.eq("tuition.branch_id", branchId);
            const result = await query.range(from, to);
            return { data: result.data as unknown as RefundRow[] | null, error: result.error };
          }),
          readAll<ExpenseRow>(async (from, to) => {
            let query = supabase.from("expenses")
              .select("id,amount,payment_method,transfer_account,expense_date,description,branch_id")
              .eq("payment_method", "transfer").gte("expense_date", start).lt("expense_date", end)
              .order("expense_date", { ascending: false }).order("id");
            if (role === "manager" && branchId) query = query.eq("branch_id", branchId);
            const result = await query.range(from, to);
            return { data: result.data as ExpenseRow[] | null, error: result.error };
          }),
          readAll<RevenueRow>(async (from, to) => {
            let query = supabase.from("other_revenues")
              .select("id,amount,payment_method,transfer_account,revenue_date,description,branch_id")
              .eq("payment_method", "transfer").gte("revenue_date", start).lt("revenue_date", end)
              .order("revenue_date", { ascending: false }).order("id");
            if (role === "manager" && branchId) query = query.eq("branch_id", branchId);
            const result = await query.range(from, to);
            return { data: result.data as RevenueRow[] | null, error: result.error };
          }),
          role === "manager" && branchId
            ? supabase.from("branches").select("id,name").eq("id", branchId).order("name")
            : supabase.from("branches").select("id,name").order("name"),
          role === "manager" && branchId
            ? supabase.from("classes").select("id,name,branch_id,status").eq("branch_id", branchId).order("name")
            : supabase.from("classes").select("id,name,branch_id,status").order("name"),
        ]);
        if (branchesResult.error || classesResult.error) throw new Error(branchesResult.error?.message ?? classesResult.error?.message);
        const sourceRows = transactionRows(payments, refunds, expenses, revenues, []);
        const transferSources = new Map(sourceRows.map((row) => [`${row.sourceType}:${row.id}`, row]));
        const refundTotalsInCents = new Map<string, number>();
        const firstRefundByBatch = new Map<string, RefundRow>();
        for (const refund of refunds) {
          if (!refund.refund_batch_id) continue;
          refundTotalsInCents.set(refund.refund_batch_id,
            (refundTotalsInCents.get(refund.refund_batch_id) ?? 0) + Math.round(Number(refund.amount) * 100));
          if (!firstRefundByBatch.has(refund.refund_batch_id)) firstRefundByBatch.set(refund.refund_batch_id, refund);
        }
        const transferRefundTotals = new Map([...refundTotalsInCents].map(([id, cents]) => [id, cents / 100]));
        for (const [batchId, refund] of firstRefundByBatch) {
          const source = transferSources.get(`tuition_refund:${refund.id}`);
          if (source) transferSources.set(`tuition_refund:${batchId}`, source);
        }
        const sourceBatches = buildTransferLedgerSourceBatches(sourceRows, transferRefundTotals);
        const ledgerChunks = await Promise.all(sourceBatches.map(async (batch) => {
          let query = supabase.from("cash_ledger")
            .select("id,business_date,direction,amount,description,branch_id,source_type,source_id,reversal_of")
            .eq("source_type", batch.sourceType).in("source_id", batch.sourceIds);
          if (batch.amount !== undefined) query = query.eq("amount", batch.amount);
          if (role === "manager" && branchId) query = query.eq("branch_id", branchId);
          const result = await query;
          if (result.error) throw new Error(result.error.message);
          return (result.data ?? []) as PrivacyLedgerRow[];
        }));
        const sourceLedger = ledgerChunks.flat();
        const sourceLedgerIds = sourceLedger.map((row) => row.id);
        const reversalChunks = await Promise.all(Array.from({ length: Math.ceil(sourceLedgerIds.length / 100) }, async (_, index) => {
          let query = supabase.from("cash_ledger")
            .select("id,business_date,direction,amount,description,branch_id,source_type,source_id,reversal_of")
            .eq("source_type", "reversal")
            .in("reversal_of", sourceLedgerIds.slice(index * 100, index * 100 + 100));
          if (role === "manager" && branchId) query = query.eq("branch_id", branchId);
          const result = await query;
          if (result.error) throw new Error(result.error.message);
          return (result.data ?? []) as PrivacyLedgerRow[];
        }));
        const reversedLedgerIds = new Set(reversalChunks.flat().map((row) => row.reversal_of));
        const reversedSources: ReversalRow[] = sourceLedger.filter((row) => reversedLedgerIds.has(row.id) && row.source_id &&
          ["expense", "other_revenue"].includes(row.source_type))
          .map((row) => ({ source_type: row.source_type, source_id: row.source_id! }));
        const validRefundBatchIds = matchedTransferRefundBatchIds(sourceLedger, transferRefundTotals);
        const validRefunds = refunds.filter((row) => !row.refund_batch_id || validRefundBatchIds.has(row.refund_batch_id));
        const scopedTransactions = transactionRows(payments, validRefunds, expenses, revenues, reversedSources);
        const resolvedLedger = resolveTransferLedgerRows([...sourceLedger, ...reversalChunks.flat()], transferSources, transferRefundTotals);
        const ledgerSourceKeys = new Set(sourceLedger.filter((row) => row.source_id)
          .map((row) => `${row.source_type}:${row.source_id}`));
        const batchedRefundIds = new Set(validRefunds.filter((row) => row.refund_batch_id).map((row) => row.id));
        const legacySources = scopedTransactions.filter((row) => !ledgerSourceKeys.has(`${row.sourceType}:${row.id}`) &&
          !(row.sourceType === "tuition_refund" && batchedRefundIds.has(row.id)));
        const ids = [...new Set(payments.map((row) => tuitionRef(row.tuition)?.student_id).filter((id): id is string => Boolean(id)))];
        const studentChunks = await Promise.all(Array.from({ length: Math.ceil(ids.length / 100) }, async (_, index) => {
          const result = await supabase.from("students").select("id,student_code,full_name,status")
            .in("id", ids.slice(index * 100, index * 100 + 100));
          if (result.error) throw new Error(result.error.message);
          return (result.data ?? []) as Student[];
        }));
        if (!active) return;
        setTransactions(scopedTransactions);
        setFinanceTransactions([...resolvedLedger, ...legacySources].sort((a, b) => b.date.localeCompare(a.date)));
        setStudents(studentChunks.flat());
        setBranches((branchesResult.data ?? []) as Branch[]);
        setClasses((classesResult.data ?? []) as DanceClass[]);
        setLoading(false);
      } catch (failure) {
        if (!active) return;
        setError(failure instanceof Error ? failure.message : "Không tải được dữ liệu.");
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [branchId, endDate, revision, role, startDate, supabase]);

  const scopeBranchId = role === "manager" ? branchId : branchFilter || null;
  const visibleTransactions = useMemo(() => role === "manager" && !branchId ? [] :
    filterPrivacyTransactions(transactions, startDate, endDate, scopeBranchId),
  [branchId, endDate, role, scopeBranchId, startDate, transactions]);
  const visibleFinanceTransactions = useMemo(() => role === "manager" && !branchId ? [] :
    filterPrivacyTransactions(financeTransactions, startDate, endDate, scopeBranchId),
  [branchId, endDate, financeTransactions, role, scopeBranchId, startDate]);
  const tuitionRows = visibleTransactions.filter((row) => row.sourceType === "tuition_payment" || row.sourceType === "tuition_refund");
  const paymentRows = tuitionRows.filter((row) => row.sourceType === "tuition_payment");
  const eligibleStudentIds = new Set(paymentRows.map((row) => row.studentId).filter((id): id is string => Boolean(id)));
  const summaryRows = pathname === "/finance" || pathname === "/dashboard" ? visibleFinanceTransactions : tuitionRows;
  const summary = summarizePrivacyTransactions(summaryRows);
  const transferAccountTotals = summarizeTransferAccounts(visibleFinanceTransactions);
  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const classById = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes]);
  const visibleStudents = students.filter((student) => eligibleStudentIds.has(student.id));
  const selectedStudentId = pathname.match(/^\/students\/([0-9a-f-]{36})$/i)?.[1];
  const selectedClassId = pathname.match(/^\/branches\/([0-9a-f-]{36})$/i)?.[1];
  const selectedStudent = selectedStudentId ? visibleStudents.find((student) => student.id === selectedStudentId) : null;
  const selectedClass = selectedClassId ? classes.find((item) => item.id === selectedClassId) : null;
  const selectedClassStudents = selectedClass
    ? visibleStudents.filter((student) => paymentRows.some((row) => row.classId === selectedClass.id && row.studentId === student.id))
    : [];
  const title = pathname === "/finance" ? "Tài chính" : pathname.startsWith("/tuition") ? "Học phí" :
    pathname.startsWith("/students") ? "Học viên" : pathname.startsWith("/branches") ? "Cơ sở & Lớp" : "Dashboard";

  return <div className="space-y-5 pb-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-3xl font-black">{title}</h1>
      <div className="flex flex-wrap gap-2">
        {pathname !== "/tuition" && <Link href="/tuition" className="ui-btn ui-btn-blue">Thu học phí</Link>}
        <label className="sr-only" htmlFor="privacy-period">{isFinance ? "Ngày xem" : "Tháng xem"}</label>
        <input id="privacy-period" className="ui-input w-auto" type={isFinance ? "date" : "month"} value={isFinance ? date : month}
          onChange={(event) => { const value = event.target.value; if (!value) return; if (isFinance) { setDate(value); setMonth(value.slice(0, 7)); } else setMonth(value); }} />
        {role === "admin" && <select className="ui-input w-auto" aria-label="Cơ sở" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
          <option value="">Toàn CLB</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>}
      </div>
    </header>

    {(pathname === "/dashboard" || pathname === "/finance") && <section className="ui-card p-4">
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={showTransferBreakdown}
        onClick={() => setShowTransferBreakdown((value) => !value)}>
        <span className="font-bold">Chuyển khoản</span><strong>{money(summary.net)} {showTransferBreakdown ? "−" : "+"}</strong>
      </button>
      {showTransferBreakdown && <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["H", "A", "S", "V"] as const).map((account) => {
          const total = transferAccountTotals[account];
          return <div key={account} className="rounded-xl bg-slate-50 p-3 text-sm"><strong>{account}</strong>
            <div className="mt-1 text-slate-500">Thu {money(total.income)}</div><div className="text-slate-500">Chi {money(total.expense)}</div>
          </div>;
        })}
      </div>}
    </section>}

    {loading ? <div className="ui-card p-8 text-slate-500">Đang tải dữ liệu…</div> : error ?
      <div className="ui-card p-8 text-rose-700">Không tải được dữ liệu: {error}</div> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Đã thu" value={money(summary.income)} />
        <Metric label="Đã chi" value={money(summary.expense)} />
        <Metric label="Còn lại" value={money(summary.net)} />
        <Metric label="Số học viên" value={String(eligibleStudentIds.size)} />
      </section>

      {pathname.startsWith("/students") ? <section className="ui-card overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black">{selectedStudent ? selectedStudent.full_name : "Danh sách học viên"}</h2></div>
        {selectedStudentId && !selectedStudent ? <p className="p-6 text-sm text-slate-500">Không có giao dịch trong khoảng thời gian này.</p> :
          selectedStudent ? <div className="p-5"><p className="mb-4 text-sm text-slate-500">{selectedStudent.student_code}</p><TransactionList rows={tuitionRows.filter((row) => row.studentId === selectedStudent.id)} students={studentById} classes={classById} /></div> :
          visibleStudents.length === 0 ? <p className="p-6 text-sm text-slate-500">Không có học viên trong khoảng thời gian này.</p> :
          <div className="divide-y divide-slate-100">{visibleStudents.map((student) => {
            const studentRows = tuitionRows.filter((row) => row.studentId === student.id);
            const net = studentRows.reduce((total, row) => total + (row.direction === "in" ? row.amount : -row.amount), 0);
            return <Link key={student.id} href={`/students/${student.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"><span><strong className="block">{student.full_name}</strong><small className="text-slate-500">{student.student_code}</small></span><strong>{money(net)}</strong></Link>;
          })}</div>}
      </section> : pathname.startsWith("/branches") ? <section className="space-y-4">
        {selectedClassId && !selectedClass ? <div className="ui-card p-6 text-slate-500">Không tìm thấy lớp.</div> :
          (selectedClass ? [selectedClass] : classes).filter((item) => !scopeBranchId || item.branch_id === scopeBranchId).map((item) => {
            const rows = tuitionRows.filter((row) => row.classId === item.id);
            const count = new Set(paymentRows.filter((row) => row.classId === item.id).map((row) => row.studentId).filter(Boolean)).size;
            const total = rows.reduce((sum, row) => sum + (row.direction === "in" ? row.amount : -row.amount), 0);
            return <Link key={item.id} href={`/branches/${item.id}`} className="ui-card block p-5 hover:bg-slate-50"><strong className="block text-lg">{item.name}</strong><span className="mt-1 block text-sm text-slate-500">{branches.find((branch) => branch.id === item.branch_id)?.name ?? "Cơ sở"} · {count} học viên</span><span className="mt-2 block font-black">{money(total)}</span></Link>;
          })}
        {selectedClass && <div className="ui-card overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black">Học viên</h2></div>
          {selectedClassStudents.length === 0 ?
            <p className="p-6 text-sm text-slate-500">Không có học viên trong khoảng thời gian này.</p> :
            <div className="divide-y divide-slate-100">{selectedClassStudents.map((student) =>
              <Link key={student.id} href={`/students/${student.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50"><span><strong className="block">{student.full_name}</strong><small className="text-slate-500">{student.student_code}</small></span><strong>{money(tuitionRows.filter((row) => row.classId === selectedClass.id && row.studentId === student.id).reduce((total, row) => total + (row.direction === "in" ? row.amount : -row.amount), 0))}</strong></Link>
            )}</div>}
        </div>}
      </section> : pathname === "/tuition" ? <TransactionList rows={tuitionRows} students={studentById} classes={classById} /> :
        <TransactionList rows={pathname === "/finance" ? visibleFinanceTransactions : visibleFinanceTransactions.slice(0, 20)} students={studentById} classes={classById} />}
    </>}
  </div>;
}
