"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { vietnamToday } from "@/lib/vietnam-date";
import { accountBalances, summarizeLedger, type LedgerEntry } from "@/lib/finance/ledger";
import { useRealtimeRefresh } from "@/components/realtime/global-realtime-provider";

type Account = { id: string; name: string; account_type: "cash" | "bank"; is_active: boolean; branch_id: string | null; balance?: number };
type Branch = { id: string; name: string };
type Closing = { id: string; account_id: string; version: number; expected_balance: number; counted_balance: number; variance: number; closed_by_name: string; closed_at: string; note: string | null };
type Role = "admin" | "manager" | "teacher";

const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + " đ";
const isoDate = (offset: number) => {
  const date = new Date(`${vietnamToday()}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};

export default function FinancePage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [date, setDate] = useState(vietnamToday());
  const [branchFilter, setBranchFilter] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [myBranchId, setMyBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingAccount, setOpeningAccount] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingNote, setOpeningNote] = useState("");
  const [showTransferBreakdown, setShowTransferBreakdown] = useState(false);

  const activeBranchId = role === "manager" ? myBranchId : branchFilter || null;

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace("/login"); return; }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role,is_active,branch_id").eq("id", auth.user.id).maybeSingle();
    if (profileError || !profile?.is_active || !["admin", "manager"].includes(profile.role)) { router.replace("/dashboard"); return; }
    const nextRole = profile.role as Role;
    setRole(nextRole);
    setMyBranchId(profile.branch_id ?? null);
    const nextBranch = nextRole === "manager" ? profile.branch_id : branchFilter || null;
    let closingQuery = supabase.from("daily_cash_closings").select("id,account_id,version,expected_balance,counted_balance,variance,closed_by_name,closed_at,note").eq("business_date", date).order("version", { ascending: false });
    closingQuery = nextBranch ? closingQuery.eq("branch_id", nextBranch) : closingQuery.limit(0);
    const [branchRes, accountRes, ledgerRes, reversalRes, closingRes, balanceRes] = await Promise.all([
      supabase.from("branches").select("id,name").order("name"),
      supabase.from("cash_accounts").select("id,name,account_type,is_active,branch_id").order("account_type").order("name"),
      supabase.from("cash_ledger").select("id,occurred_at,business_date,account_id,direction,amount,category,description,branch_id,source_type,source_id,created_by_name,reversal_of,metadata,account:cash_accounts!cash_ledger_account_id_fkey(id,name,account_type)").eq("business_date", date).order("occurred_at", { ascending: false }).limit(1000),
      supabase.from("finance_source_reversals").select("source_type,source_id"),
      closingQuery,
      supabase.rpc("get_cash_balances_as_of", { p_business_date: date, p_branch_id: nextBranch }),
    ]);
    const error = branchRes.error ?? accountRes.error ?? ledgerRes.error ?? reversalRes.error ?? closingRes.error ?? balanceRes.error;
    if (error) { alert("Không tải được sổ quỹ: " + error.message); setLoading(false); return; }
    setBranches(branchRes.data ?? []);
    const allAccounts = (accountRes.data ?? []) as Account[];
    const balances = (balanceRes.data ?? []) as Array<{ account_id: string; balance: number }>;
    const balanceMap = new Map(balances.map((item) => [item.account_id, Number(item.balance)]));
    setAccounts(allAccounts.map((account) => ({ ...account, balance: balanceMap.get(account.id) ?? 0 }))
      .filter((account) => account.is_active && (!nextBranch || account.branch_id === null || account.branch_id === nextBranch)));
    let nextEntries = (ledgerRes.data ?? []) as unknown as LedgerEntry[];
    const reversedSources = new Set((reversalRes.data ?? []).map((item) => `${item.source_type}:${item.source_id}`));
    nextEntries = nextEntries.map((entry) => ({
      ...entry,
      is_reversed_source: Boolean(entry.source_id && reversedSources.has(`${entry.source_type}:${entry.source_id}`)),
    }));
    if (nextBranch) nextEntries = nextEntries.filter((entry) => entry.branch_id === nextBranch);
    setEntries(nextEntries);
    const latestClosings = new Map<string, Closing>();
    for (const closing of (closingRes.data ?? []) as Closing[]) {
      if (!latestClosings.has(closing.account_id)) latestClosings.set(closing.account_id, closing);
    }
    setClosings(nextBranch ? [...latestClosings.values()] : []);
    setCounted(Object.fromEntries(allAccounts.filter((account) => account.is_active).map((account) => [account.id, ""])));
    setLoading(false);
  }, [branchFilter, date, router, supabase]);

  useEffect(() => { void loadData(); }, [loadData]);
  useRealtimeRefresh(["finance"], loadData);

  const summary = summarizeLedger(entries);
  const dayBalances = accountBalances(entries);
  const latestClosingByAccount = new Map(closings.map((closing) => [closing.account_id, closing]));
  const transferBreakdown = (["H", "A", "S", "V"] as const).map((account) => {
    const rows = entries.filter((entry) => {
      const method = entry.metadata?.payment_method ?? entry.metadata?.refund_payment_method;
      if (method !== "transfer") return false;
      const value = entry.metadata?.transfer_account;
      const legacyAccount = value === "A" || value === "S" || value === "V" ? value : "H";
      return legacyAccount === account;
    });
    return {
      account,
      income: rows.filter((entry) => entry.direction === "in").reduce((sum, entry) => sum + Number(entry.amount), 0),
      expense: rows.filter((entry) => entry.direction === "out").reduce((sum, entry) => sum + Number(entry.amount), 0),
    };
  });

  async function closeDay(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBranchId) { alert("Chọn một cơ sở cụ thể để chốt quỹ."); return; }
    if (accounts.some((account) => counted[account.id] === "" || !Number.isFinite(Number(counted[account.id])) || Number(counted[account.id]) < 0)) {
      alert("Nhập số tiền đã đếm cho từng tài khoản trước khi chốt quỹ.");
      return;
    }
    const rows = accounts.map((account) => ({ account_id: account.id, counted_balance: Number(counted[account.id]), note: null }));
    setSaving(true);
    const { data, error } = await supabase.rpc("close_daily_cash", { p_business_date: date, p_branch_id: activeBranchId, p_counts: rows });
    setSaving(false);
    if (error) { alert("Không thể chốt quỹ: " + error.message); return; }
    const closingRows = (data?.closings ?? []) as Array<{ variance: number; account_name: string }>;
    const mismatch = closingRows.find((row) => Math.abs(Number(row.variance)) > 0.01);
    alert(mismatch ? `⚠ ${Number(mismatch.variance) < 0 ? "Thiếu" : "Thừa"} quỹ ${money(Math.abs(Number(mismatch.variance)))} · ${mismatch.account_name}` : "✅ Đã lưu lần chốt quỹ.");
    await loadData();
  }

  async function recordOpening(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBranchId) { alert("Chọn một cơ sở cụ thể trước khi ghi số dư đầu kỳ."); return; }
    if (!openingAccount || openingBalance === "" || Number(openingBalance) <= 0) { alert("Chọn tài khoản và nhập số dư đầu kỳ lớn hơn 0."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("record_cash_opening_balance", {
      p_account_id: openingAccount, p_branch_id: activeBranchId, p_business_date: date,
      p_balance: Number(openingBalance), p_note: openingNote.trim() || null,
    });
    setSaving(false);
    if (error) { alert("Không thể ghi số dư đầu kỳ: " + error.message); return; }
    setOpeningBalance(""); setOpeningNote(""); await loadData();
  }

  async function reverse(entry: LedgerEntry) {
    const reason = window.prompt(`Lý do đảo giao dịch “${entry.description}” · ${money(Number(entry.amount))}:`);
    if (!reason?.trim()) return;
    const result = entry.source_type === "account_transfer"
      ? await supabase.rpc("reverse_cash_transfer", { p_transfer_id: entry.source_id, p_note: reason.trim() })
      : entry.source_type === "opening_balance"
        ? await supabase.rpc("reverse_cash_opening_balance", { p_opening_id: entry.source_id, p_note: reason.trim() })
        : await supabase.rpc("reverse_cash_ledger", { p_ledger_id: entry.id, p_note: reason.trim() });
    const { error } = result;
    if (error) { alert("Không thể đảo giao dịch: " + error.message); return; }
    await loadData();
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-blue-600">SỔ QUỸ · ASIA/HO_CHI_MINH</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">💰 Tài chính</h1>
          <p className="mt-2 text-slate-500">Dòng tiền thực tế, lịch sử theo ngày và chốt quỹ.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="ui-btn" href="/tuition">Thu học phí</Link>
          <Link className="ui-btn" href="/other-revenue">Thu khác</Link>
          <Link className="ui-btn" href="/expenses">Ghi chi phí</Link>
          {role === "admin" && <Link className="ui-btn ui-btn-blue" href="/finance/monitor">Giám sát tài chính</Link>}
        </div>
      </header>

      <section className="ui-card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="text-sm font-bold">Ngày xem<input className="ui-input mt-1 block" type="date" value={date} max={vietnamToday()} onChange={(event) => setDate(event.target.value)} /></label>
        <div className="flex gap-2">
          <button className="ui-btn" onClick={() => setDate(isoDate(-1))}>← Ngày trước</button>
          <button className="ui-btn" onClick={() => setDate(vietnamToday())}>Hôm nay</button>
          <button className="ui-btn" disabled={date >= vietnamToday()} onClick={() => setDate(isoDate(1))}>Ngày sau →</button>
        </div>
        {role === "admin" && <label className="text-sm font-bold sm:ml-auto">Cơ sở<select className="ui-input mt-1 block" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="">Toàn CLB</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Thu thực tế" value={money(summary.income)} color="text-emerald-700" />
        <Metric label="Chi thực tế" value={money(summary.expense)} color="text-rose-700" />
        <Metric label="Dòng tiền ròng" value={money(summary.net)} color={summary.net < 0 ? "text-rose-700" : "text-slate-900"} />
        <Metric label="Giao dịch · điều chỉnh" value={`${summary.transactions} · ${summary.adjustments}`} color="text-blue-700" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {accounts.map((account) => <div key={account.id} className="ui-card flex items-center justify-between gap-3 p-4"><div><div className="text-sm font-bold text-slate-500">{account.account_type === "cash" ? "💵 Tiền mặt" : "🏦 Chuyển khoản"}</div><div className="font-black">{account.name}</div><div className="mt-1 text-xs text-slate-400">Biến động ngày: {money(dayBalances.get(account.id) ?? 0)}</div>{account.account_type === "bank" && <button type="button" className="mt-2 text-xs font-bold text-blue-700 underline" aria-expanded={showTransferBreakdown} onClick={() => setShowTransferBreakdown((value) => !value)}>Chi tiết H / A / S / V</button>}</div><strong className="text-right text-xl">{money(account.balance ?? 0)}</strong></div>)}
      </section>
      {showTransferBreakdown && <section className="ui-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chi tiết chuyển khoản trong ngày">
        {transferBreakdown.map((item) => <div key={item.account} className="rounded-xl bg-slate-50 p-3 text-sm"><strong>{item.account}</strong><div className="mt-1 text-slate-500">Thu {money(item.income)}</div><div className="text-slate-500">Chi {money(item.expense)}</div></div>)}
      </section>}

      <section className="ui-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black">Giao dịch ngày {date}</h2><p className="text-sm text-slate-500">Sắp xếp giao dịch mới nhất trước.</p></div><span className="text-sm font-bold text-slate-500">{entries.length} dòng</span></div>
        {loading ? <p className="p-8 text-center text-slate-400">Đang tải sổ quỹ…</p> : entries.length === 0 ? <p className="p-8 text-center text-slate-400">Chưa có dòng tiền trong ngày này.</p> : <ul className="divide-y divide-slate-100">{entries.map((entry) => {
          const canReverse = !entry.reversal_of && !entry.is_reversed_source && ["expense", "other_revenue", "account_transfer", "opening_balance"].includes(entry.source_type);
          return <li key={entry.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{entry.description}</strong>{entry.reversal_of && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Điều chỉnh</span>}{entry.is_reversed_source && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">Nguồn đã đảo</span>}<span className="text-xs text-slate-400">{new Date(entry.occurred_at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}</span></div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span>{entry.account?.name ?? "Tài khoản"}</span><span>{branches.find((branch) => branch.id === entry.branch_id)?.name ?? (entry.branch_id ? "Cơ sở" : "Toàn CLB")}</span><span>{entry.created_by_name ?? "Không rõ người nhập"}</span><span>Nguồn: {sourceLabel(entry.source_type)}</span>{entry.source_type === "tuition_payment" && entry.source_id && <Link className="font-bold text-blue-700" href={`/tuition/receipt/${entry.source_id}`}>Biên nhận</Link>}{["tuition_payment", "tuition_refund"].includes(entry.source_type) && <span className="text-amber-700">Dùng luồng hoàn tiền/thu học phí để điều chỉnh</span>}</div>{typeof entry.metadata?.student_name === "string" && <div className="mt-1 text-xs text-slate-500">{entry.metadata.student_name}{typeof entry.metadata.class_name === "string" ? ` · ${entry.metadata.class_name}` : ""}</div>}</div><div className="flex items-center justify-between gap-3 sm:justify-end"><strong className={entry.direction === "in" ? "text-emerald-700" : "text-rose-700"}>{entry.direction === "in" ? "+" : "−"}{money(Number(entry.amount))}</strong>{canReverse && <button className="ui-btn min-h-9 px-3 text-xs" onClick={() => void reverse(entry)}>{entry.source_type === "account_transfer" ? "Đảo chuyển quỹ" : "Đảo"}</button>}</div></li>;
        })}</ul>}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={recordOpening} className="ui-card space-y-3 p-4 sm:p-5">
          <div><h2 className="text-lg font-black">Ghi số dư đầu kỳ</h2><p className="text-sm text-slate-500">Dùng một lần để mở số dư cho sổ quỹ mới. Việc ghi sổ không tạo dữ liệu học phí cũ.</p>{role === "admin" && !activeBranchId && <p className="mt-2 font-bold text-amber-700">Chọn một cơ sở cụ thể ở bộ lọc phía trên để mở biểu mẫu.</p>}</div>
          <fieldset disabled={saving || !activeBranchId} className="space-y-3 disabled:opacity-50">
          <select className="ui-input w-full" value={openingAccount} onChange={(event) => setOpeningAccount(event.target.value)} required><option value="">Chọn tài khoản</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
          <input className="ui-input w-full" type="number" min="1" step="1" placeholder="Số dư thực đếm" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} required />
          <input className="ui-input w-full" placeholder="Ghi chú / căn cứ số dư" value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} />
          <button className="ui-btn ui-btn-blue" disabled={saving}>{saving ? "Đang lưu…" : "Ghi số dư đầu kỳ"}</button>
          </fieldset>
        </form>

        <form onSubmit={closeDay} className="ui-card space-y-3 p-4 sm:p-5">
          <div><h2 className="text-lg font-black">Chốt quỹ ngày {date}</h2><p className="text-sm text-slate-500">Mỗi lần chốt được lưu thành một phiên bản lịch sử mới.</p></div>
          {!activeBranchId && <p className="font-bold text-amber-700">Chọn CS1 hoặc CS2 để chốt quỹ.</p>}
          <fieldset disabled={saving || !activeBranchId} className="space-y-3 disabled:opacity-50">
          {accounts.map((account) => {
            const closing = latestClosingByAccount.get(account.id);
            return <label key={account.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-sm"><span><strong className="block">{account.name}</strong><span className="text-xs text-slate-500">Hệ thống: {money(Number(closing?.expected_balance ?? account.balance ?? 0))}{closing ? ` · lần ${closing.version}` : ""}</span></span><input className="ui-input w-40 text-right" type="number" min="0" step="1" placeholder="Đã đếm" value={counted[account.id] ?? ""} onChange={(event) => setCounted((state) => ({ ...state, [account.id]: event.target.value }))} /></label>;
          })}
          <button className="ui-btn ui-btn-primary w-full sm:w-auto" disabled={saving || accounts.length === 0}>{saving ? "Đang chốt…" : "Chốt quỹ"}</button>
          </fieldset>
          {closings.length > 0 && <div className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">{closings.map((closing) => <div key={closing.id} className={Math.abs(Number(closing.variance)) > 0.01 ? "font-bold text-rose-700" : ""}>{accounts.find((account) => account.id === closing.account_id)?.name}: đếm {money(Number(closing.counted_balance))} · lệch {money(Number(closing.variance))} · {closing.closed_by_name} · {new Date(closing.closed_at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</div>)}</div>}
        </form>
      </section>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="ui-card p-4 sm:p-5"><div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-2 break-words text-2xl font-black ${color}`}>{value}</div></div>;
}

function sourceLabel(source: string) {
  return ({ tuition_payment: "Học phí", expense: "Chi phí", other_revenue: "Thu khác", reversal: "Đảo giao dịch", account_transfer: "Chuyển quỹ", opening_balance: "Số dư đầu kỳ" } as Record<string, string>)[source] ?? source;
}
