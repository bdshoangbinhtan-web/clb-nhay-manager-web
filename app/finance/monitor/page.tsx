"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { vietnamToday } from "@/lib/vietnam-date";
import { useRealtimeRefresh } from "@/components/realtime/global-realtime-provider";

type Issue = { issue_type: string; severity: "error" | "warning"; business_date: string; transaction_id: string | null; account_id: string | null; amount: number | null; message: string };
const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + " đ";
const issueNames: Record<string, string> = {
  missing_ledger: "Thiếu dòng sổ quỹ", payment_amount_mismatch: "Số tiền không khớp",
  orphan_ledger: "Không tìm thấy giao dịch nguồn", reversal: "Có giao dịch đảo",
  unknown_source: "Nguồn chưa nhận diện", created_after_closing: "Ghi nhận sau giờ chốt",
  cash_variance: "Lệch quỹ", unclosed_day: "Ngày chưa chốt quỹ",
};

export default function FinanceMonitorPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [from, setFrom] = useState(() => shiftDate(-30));
  const [to, setTo] = useState(vietnamToday());
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", auth.user.id).maybeSingle();
    if (profile?.role !== "admin" || !profile.is_active) { router.replace("/dashboard"); return; }
    const { data, error: rpcError } = await supabase.rpc("get_finance_audit", { p_from: from, p_to: to });
    if (rpcError) setError(rpcError.message);
    else setIssues((data?.issues ?? []) as Issue[]);
    setLoading(false);
  }, [from, router, supabase, to]);

  useEffect(() => { void loadData(); }, [loadData]);
  useRealtimeRefresh(["finance"], loadData);

  const grouped = new Map<string, Issue[]>();
  for (const issue of issues) grouped.set(issue.issue_type, [...(grouped.get(issue.issue_type) ?? []), issue]);

  return <div className="space-y-6 pb-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href="/finance" className="text-sm font-bold text-blue-700">← Tài chính</Link><div className="mt-3 text-xs font-black uppercase tracking-widest text-blue-600">CHỈ ADMIN</div><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">🔎 Giám sát tài chính</h1><p className="mt-2 text-slate-500">Kiểm tra tự động khoản thiếu sổ, lệch tiền, giao dịch đảo và ngày chưa chốt.</p></div>
      <button className="ui-btn" onClick={() => void loadData()}>Làm mới</button>
    </header>

    <section className="ui-card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
      <label className="text-sm font-bold">Từ ngày<input className="ui-input mt-1 block" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="text-sm font-bold">Đến ngày<input className="ui-input mt-1 block" type="date" value={to} max={vietnamToday()} onChange={(event) => setTo(event.target.value)} /></label>
      <span className="text-xs text-slate-500 sm:ml-auto">Tối đa 367 ngày · giờ Việt Nam</span>
    </section>

    {loading ? <div className="ui-card p-8 text-center text-slate-400">Đang đối chiếu sổ quỹ…</div> : error ? <div className="ui-card border border-rose-200 p-6 text-rose-700">Không chạy được kiểm tra: {error}</div> : issues.length === 0 ? <div className="ui-card border border-emerald-200 bg-emerald-50 p-8 text-center"><div className="text-3xl">✅</div><h2 className="mt-2 text-xl font-black text-emerald-900">Không phát hiện chênh lệch tài chính</h2><p className="mt-1 text-sm text-emerald-800">Không có cảnh báo trong khoảng {from} đến {to}.</p></div> : <>
      <section className="grid gap-3 sm:grid-cols-3"><Metric label="Vấn đề cần xử lý" value={String(issues.filter((issue) => issue.severity === "error").length)} /><Metric label="Cảnh báo" value={String(issues.filter((issue) => issue.severity === "warning").length)} /><Metric label="Khoảng ngày" value={`${from} → ${to}`} /></section>
      <section className="space-y-4">{[...grouped.entries()].map(([type, rows]) => <div key={type} className="ui-card overflow-hidden"><div className={`border-b p-4 ${rows.some((row) => row.severity === "error") ? "border-rose-100 bg-rose-50" : "border-amber-100 bg-amber-50"}`}><h2 className="font-black">{issueNames[type] ?? type} <span className="text-sm">· {rows.length}</span></h2></div><ul className="divide-y divide-slate-100">{rows.map((issue, index) => <li key={`${type}-${issue.transaction_id ?? issue.business_date}-${index}`} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong>{issue.message}</strong><div className="mt-1 text-xs text-slate-500">{issue.business_date}{issue.transaction_id ? ` · ID ${issue.transaction_id}` : ""}</div></div>{issue.amount !== null && <span className={`font-black ${Number(issue.amount) < 0 ? "text-rose-700" : "text-slate-800"}`}>{money(Number(issue.amount))}</span>}</li>)}</ul></div>)}</section>
    </>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="ui-card p-4"><div className="text-xs font-black uppercase text-slate-500">{label}</div><div className="mt-2 break-all text-xl font-black">{value}</div></div>; }

function shiftDate(offset: number) {
  const date = new Date(`${vietnamToday()}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
