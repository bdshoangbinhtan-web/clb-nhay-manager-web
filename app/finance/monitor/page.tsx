"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { vietnamToday } from "@/lib/vietnam-date";
import { useRealtimeRefresh } from "@/components/realtime/global-realtime-provider";

type ReviewStatus = "unchecked" | "reviewing" | "verified" | "fixed";
type AuditIssue = {
  issue_key?: string;
  issue_type: string;
  severity: "error" | "warning";
  business_date: string;
  transaction_id: string | null;
  account_id: string | null;
  amount: number | null;
  message: string;
  branch_id?: string | null;
  branch_name?: string | null;
  account_name?: string | null;
  ledger_description?: string | null;
  ledger_source?: string | null;
  student_name?: string | null;
  review_status?: ReviewStatus;
  review_note?: string;
  reviewed_at?: string | null;
};
type PendingClosing = {
  business_date: string;
  branch_id: string;
  branch_name: string;
  transaction_count: number;
  pending_accounts: number;
  pending_account_names: string[];
};
type Audit = {
  issues: AuditIssue[];
  history: AuditIssue[];
  pending_closings: PendingClosing[];
  ignored_empty_days: number;
};
type Branch = { id: string; name: string };
type Tab = "issues" | "closings" | "history";

const issueGuides: Record<string, { title: string; detail: string; action: string; href: string; priority: string }> = {
  missing_ledger: {
    title: "Thu hoặc chi chưa xuất hiện trong sổ quỹ",
    detail: "Đã có chứng từ thu/chi, nhưng hệ thống chưa tìm thấy dòng tiền tương ứng.",
    action: "Mở chứng từ gốc, đối chiếu ngày, tài khoản và số tiền. Không tự thu hoặc chi lại.",
    href: "/finance", priority: "Cần xử lý",
  },
  payment_amount_mismatch: {
    title: "Tiền thu học phí khác với số đã ghi sổ",
    detail: "Giá trị trên phiếu thu và dòng sổ quỹ chưa trùng nhau.",
    action: "So phiếu thu với dòng sổ, kiểm tra xem đã có lần điều chỉnh hay hoàn tiền nào chưa.",
    href: "/tuition", priority: "Cần xử lý",
  },
  refund_amount_mismatch: {
    title: "Tiền hoàn học phí chưa khớp",
    detail: "Tổng các khoản hoàn học phí khác giá trị hoàn tiền trên sổ.",
    action: "Kiểm tra phiếu hoàn tiền và các khoản điều chỉnh liên quan.",
    href: "/tuition", priority: "Cần xử lý",
  },
  orphan_ledger: {
    title: "Dòng sổ quỹ cần đối chiếu chứng từ gốc",
    detail: "Hệ thống không tìm được chứng từ đang có hiệu lực tương ứng với dòng sổ.",
    action: "Kiểm tra lịch sử hủy/đảo giao dịch và chứng từ gốc. Nếu đã đảo đúng thì không tự kết luận thất thoát.",
    href: "/finance", priority: "Cần xác minh",
  },
  cash_variance: {
    title: "Số tiền kiểm quỹ chưa khớp hệ thống",
    detail: "Lần chốt gần nhất ghi nhận tiền đếm thực tế khác số dư dự kiến.",
    action: "Kiểm lại tiền thực tế và chứng từ trong ngày. Không tự điều chỉnh số dư.",
    href: "/finance", priority: "Ưu tiên kiểm tra",
  },
  created_after_closing: {
    title: "Có giao dịch ghi sau khi đã chốt ngày",
    detail: "Một giao dịch mới được ghi nhận sau lần chốt quỹ của cùng ngày.",
    action: "Kiểm tra giao dịch bổ sung, sau đó xác nhận lại số dư; không tự động coi đó là sai tiền.",
    href: "/finance", priority: "Cần đối chiếu",
  },
  unknown_source: {
    title: "Giao dịch chưa nhận diện được nguồn",
    detail: "Một dòng tiền có nguồn không nằm trong danh sách nghiệp vụ đã hỗ trợ.",
    action: "Đối chiếu mô tả và tài khoản, chuyển hỗ trợ kỹ thuật nếu cần.",
    href: "/finance", priority: "Kiểm tra kỹ thuật",
  },
  reversal: {
    title: "Giao dịch đã được đảo",
    detail: "Một thao tác điều chỉnh đã ghi thêm dòng đảo để bảo toàn lịch sử.",
    action: "Đối chiếu lý do và dòng gốc khi cần, không mặc định đây là lỗi.",
    href: "/finance", priority: "Lịch sử",
  },
};
const reviewNames: Record<ReviewStatus, string> = {
  unchecked: "Chưa xác minh",
  reviewing: "Đang đối chiếu",
  verified: "Đã xác minh",
  fixed: "Đã đánh dấu khắc phục",
};
const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + " đ";
const showDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-");
  return [day, month, year].filter(Boolean).join("/");
};
function shiftDate(offset: number) {
  const date = new Date(`${vietnamToday()}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export default function FinanceMonitorPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [from, setFrom] = useState(() => shiftDate(-6));
  const [to, setTo] = useState(vietnamToday());
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [tab, setTab] = useState<Tab>("issues");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedIssue, setExpandedIssue] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("reviewing");
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!from || !to || from > to || to > vietnamToday()) {
      setError("Khoảng ngày không hợp lệ. Hãy chọn từ ngày trước hoặc bằng đến ngày, không chọn ngày tương lai.");
      setLoading(false);
      return;
    }
    setLoading(true); setError("");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { router.replace("/login"); return; }
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("role,is_active").eq("id",auth.user.id).maybeSingle();
    if (profileError || profile?.role !== "admin" || !profile.is_active) {
      router.replace("/dashboard"); return;
    }
    const [branchResponse, auditResponse] = await Promise.all([
      supabase.from("branches").select("id,name").order("name"),
      supabase.rpc("get_finance_monitor_v2", { p_from: from, p_to: to, p_branch_id: branchId || null }),
    ]);
    if (branchResponse.error) {
      setError("Không thể tải danh sách cơ sở: " + branchResponse.error.message);
    } else if (auditResponse.error) {
      setError("Không thể giám sát tài chính: " + auditResponse.error.message);
    } else {
      setBranches((branchResponse.data ?? []) as Branch[]);
      const result = auditResponse.data as Partial<Audit> | null;
      setAudit({
        issues: result?.issues ?? [],
        history: result?.history ?? [],
        pending_closings: result?.pending_closings ?? [],
        ignored_empty_days: Number(result?.ignored_empty_days ?? 0),
      });
    }
    setLoading(false);
  }, [from,to,branchId,router,supabase]);

  useEffect(() => { void loadData(); }, [loadData]);
  useRealtimeRefresh(["finance"], loadData);

  const issues = audit?.issues ?? [];
  const pending = audit?.pending_closings ?? [];
  const history = audit?.history ?? [];
  const unreviewed = issues.filter((issue) => !["verified","fixed"].includes(issue.review_status ?? "unchecked")).length;
  const displayedIssues = issues.filter((issue) => statusFilter === "all" ||
    (issue.review_status ?? "unchecked") === statusFilter);
  const groupedIssues = Object.entries(displayedIssues.reduce<Record<string, AuditIssue[]>>((acc, issue) => {
    (acc[issue.issue_type] ??= []).push(issue);
    return acc;
  }, {}));
  const groupedClosing = Object.entries(pending.reduce<Record<string, PendingClosing[]>>((acc, row) => {
    (acc[row.branch_name || "Chưa gán cơ sở"] ??= []).push(row);
    return acc;
  }, {}));

  async function saveReview(issue: AuditIssue) {
    if (!issue.issue_key || saving) return;
    if (["verified","fixed"].includes(reviewStatus) && reviewNote.trim().length < 5) {
      setError("Khi xác minh hoặc đánh dấu đã khắc phục, vui lòng ghi rõ căn cứ (ít nhất 5 ký tự).");
      return;
    }
    setSaving(true); setError("");
    const { error: saveError } = await supabase.rpc("set_finance_monitor_review", {
      p_issue_key: issue.issue_key,
      p_review_status: reviewStatus,
      p_review_note: reviewNote.trim(),
    });
    if (saveError) setError("Không lưu được kết quả đối chiếu: " + saveError.message);
    else { setExpandedIssue(""); await loadData(); }
    setSaving(false);
  }

  function openReview(issue: AuditIssue) {
    if (!issue.issue_key) return;
    if (expandedIssue === issue.issue_key) { setExpandedIssue(""); return; }
    setExpandedIssue(issue.issue_key);
    setReviewStatus(issue.review_status ?? "unchecked");
    setReviewNote(issue.review_note ?? "");
  }

  const tabs: Array<{ value: Tab; title: string; count: number }> = [
    { value:"issues", title:"Cần kiểm tra", count:issues.length },
    { value:"closings", title:"Chốt quỹ", count:pending.length },
    { value:"history", title:"Lịch sử điều chỉnh", count:history.length },
  ];

  return <div className="space-y-5 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <Link href="/finance" className="text-sm font-bold text-blue-700 hover:underline">← Trở về Tài chính</Link>
        <h1 className="mt-2 text-3xl font-black text-slate-900">🔎 Giám sát tài chính</h1>
        <p className="text-sm text-slate-500">Đối chiếu chứng từ, theo dõi chốt quỹ và lịch sử điều chỉnh. Chỉ Admin xem và xác minh.</p>
      </div>
      <button className="ui-btn" type="button" disabled={loading} onClick={() => void loadData()}>
        {loading ? "Đang tải..." : "↻ Kiểm tra lại"}
      </button>
    </header>

    <section className="ui-card flex flex-wrap items-end gap-3 p-4">
      <label className="text-sm font-bold">Từ ngày
        <input className="ui-input mt-1 block" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="text-sm font-bold">Đến ngày
        <input className="ui-input mt-1 block" type="date" value={to} min={from} max={vietnamToday()} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label className="min-w-[180px] text-sm font-bold">Cơ sở
        <select className="ui-input mt-1 w-full" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Toàn CLB</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ui-btn" onClick={() => {setFrom(shiftDate(-6));setTo(vietnamToday());}}>7 ngày</button>
        <button type="button" className="ui-btn" onClick={() => {setFrom(shiftDate(-29));setTo(vietnamToday());}}>30 ngày</button>
      </div>
    </section>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700" role="alert">{error}</div>}
    {loading && !audit ? <div className="ui-card p-8 text-center text-slate-500">Đang kiểm tra dữ liệu sổ quỹ...</div> :
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Trường hợp cần xem" value={unreviewed} detail="Chưa hoàn tất đối chiếu" tone="rose" />
        <Metric label="Ngày / cơ sở chưa chốt" value={pending.length} detail="Chỉ tính ngày đã có giao dịch" tone="amber" />
        <Metric label="Giao dịch đảo hợp lệ cần lưu lịch sử" value={history.length} detail="Không tự xem là lỗi" tone="slate" />
      </section>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" aria-label="Khu vực giám sát tài chính">
        {tabs.map((item) => (
          <button key={item.value} type="button" aria-current={tab===item.value ? "page" : undefined}
            onClick={() => setTab(item.value)}
            className={`rounded-xl px-4 py-3 text-sm font-black transition ${tab===item.value ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
            {item.title} ({item.count})
          </button>
        ))}
      </nav>

      {tab === "issues" && <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-black">Chứng từ và dòng tiền cần đối chiếu</h2>
            <p className="mt-1 text-sm text-slate-500">Chưa có kết quả kiểm quỹ thì không thể kết luận tiền mặt đã khớp thực tế.</p>
          </div>
          <select className="ui-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Lọc trạng thái xác minh">
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(reviewNames).map(([value,name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </div>
        {displayedIssues.length === 0
          ? <div className="ui-card p-6 text-sm text-emerald-800">Không có chứng từ bất thường theo bộ lọc hiện tại. Hãy mở mục Chốt quỹ để kiểm tra những ngày chưa xác nhận tiền thực tế.</div>
          : groupedIssues.map(([type,items]) => {
            const guide = issueGuides[type] ?? {
              title:"Giao dịch cần kiểm tra",detail:"Có dữ liệu chưa khớp quy tắc đối chiếu.",
              action:"Kiểm tra nghiệp vụ gốc trước khi sửa.",href:"/finance",priority:"Cần xem",
            };
            return <div key={type} className="ui-card overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-black text-slate-900">{guide.title}</h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">{items.length} trường hợp</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{guide.detail}</p>
                <p className="mt-2 text-sm font-semibold text-blue-700">Gợi ý: {guide.action}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((issue,index) => <div key={issue.issue_key ?? index} className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-black">{issue.student_name || issue.ledger_description || guide.title}</div>
                      <p className="text-xs text-slate-500">
                        {showDate(issue.business_date)}
                        {issue.branch_name ? ` · ${issue.branch_name}` : ""}
                        {issue.account_name ? ` · ${issue.account_name}` : ""}
                      </p>
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">{reviewNames[issue.review_status ?? "unchecked"]}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {issue.amount !== null && <div className="text-right">
                        <div className="text-xs text-slate-500">{["payment_amount_mismatch","refund_amount_mismatch","cash_variance"].includes(type) ? "Khoản chênh lệch" : "Giá trị giao dịch"}</div>
                        <strong className="text-lg">{money(Math.abs(Number(issue.amount)))}</strong>
                      </div>}
                      <button type="button" className="ui-btn" onClick={() => openReview(issue)}>
                        {expandedIssue === issue.issue_key ? "Thu gọn" : "Xem / xác minh"}
                      </button>
                    </div>
                  </div>
                  {expandedIssue === issue.issue_key && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-700">{issue.message}</p>
                    <Link href={guide.href} className="text-sm font-bold text-blue-700 underline">Mở mục liên quan để kiểm tra</Link>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-bold">Trạng thái xác minh
                        <select className="ui-input mt-1 w-full" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}>
                          {Object.entries(reviewNames).map(([key,value]) => <option key={key} value={key}>{value}</option>)}
                        </select>
                      </label>
                      <label className="text-sm font-bold">Ghi chú / căn cứ đối chiếu
                        <textarea className="ui-input mt-1 w-full" rows={2} maxLength={1000} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Ví dụ: đã kiểm tra giao dịch đảo và phiếu gốc..." />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">
                      Việc đánh dấu trạng thái không thay đổi số dư, xóa chứng từ hoặc ẩn cảnh báo thực tế. Nếu nghiệp vụ vẫn còn lệch, hệ thống sẽ tiếp tục phát hiện.
                    </p>
                    <details className="text-xs text-slate-500">
                      <summary className="cursor-pointer font-semibold">Thông tin kỹ thuật (khi cần hỗ trợ)</summary>
                      <div className="mt-2 break-all">Mã giao dịch: {issue.transaction_id ?? "Không có"} · Tài khoản: {issue.account_id ?? "Không có"}</div>
                    </details>
                    <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void saveReview(issue)}
                      className="ui-btn ui-btn-primary">{saving ? "Đang lưu..." : "Lưu kết quả đối chiếu"}</button></div>
                  </div>}
                </div>)}
              </div>
            </div>;
          })}
      </section>}

      {tab === "closings" && <section className="space-y-4">
        <div>
          <h2 className="text-xl font-black">Theo dõi chốt quỹ</h2>
          <p className="mt-1 text-sm text-slate-500">
            Gom theo ngày và cơ sở, chỉ nhắc ngày có phát sinh giao dịch mà chưa chốt tài khoản liên quan.
            {audit && audit.ignored_empty_days > 0 ? ` Đã bỏ qua ${audit.ignored_empty_days} lượt tài khoản/ngày không phát sinh giao dịch.` : ""}
          </p>
        </div>
        {pending.length === 0 ? <div className="ui-card p-6 text-sm text-slate-600">Không có ngày có giao dịch đang thiếu chốt trong khoảng đã chọn. Không có nghĩa là đã kiểm đếm toàn bộ tiền mặt hoặc đối chiếu sao kê ngân hàng.</div>
          : groupedClosing.map(([name,rows]) => (
            <details key={name} className="ui-card overflow-hidden" open>
              <summary className="flex cursor-pointer items-center justify-between gap-3 bg-slate-50 p-4 font-black">
                <span>{name}</span><span className="text-sm text-amber-700">{rows.length} ngày cần xác nhận</span>
              </summary>
              <div className="divide-y divide-slate-100">
                {rows.map((row) => <div key={row.branch_id+row.business_date} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <div className="font-black">{showDate(row.business_date)}</div>
                    <div className="mt-1 text-slate-500">{row.transaction_count} dòng giao dịch · Chưa chốt: {row.pending_account_names.join(", ")}</div>
                  </div>
                  <Link href="/finance" className="font-bold text-blue-700 underline">Mở sổ quỹ</Link>
                </div>)}
              </div>
            </details>
          ))}
        <p className="text-xs text-slate-500">Tiền mặt cần kiểm đếm thực tế. Ngân hàng cần đối chiếu với sao kê; không tự xác nhận khi chưa kiểm tra.</p>
      </section>}

      {tab === "history" && <section className="space-y-4">
        <div><h2 className="text-xl font-black">Lịch sử điều chỉnh dòng tiền</h2>
          <p className="mt-1 text-sm text-slate-500">Giao dịch đảo là một phần của lịch sử kế toán, không tự động được coi là sai phạm.</p>
        </div>
        {history.length === 0 ? <div className="ui-card p-6 text-sm text-slate-500">Không có giao dịch đảo trong khoảng đã chọn.</div>
          : <div className="ui-card divide-y divide-slate-100 overflow-hidden">
            {history.map((item,index) => <div key={item.transaction_id ?? index} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-bold">{item.ledger_description || item.message}</div>
                <div className="mt-1 text-xs text-slate-500">{showDate(item.business_date)}{item.branch_name ? ` · ${item.branch_name}` : ""}{item.account_name ? ` · ${item.account_name}` : ""}</div>
                <div className="mt-1 text-xs text-slate-600">Đã ghi nhận giao dịch đảo · lưu lại để tra cứu</div>
              </div>
              {item.amount !== null && <strong>{money(Math.abs(Number(item.amount)))}</strong>}
            </div>)}
          </div>}
      </section>}
    </div>}
  </div>;
}

function Metric({ label,value,detail,tone }: { label:string; value:number; detail:string; tone:"rose"|"amber"|"slate" }) {
  const color = tone==="rose" ? "text-rose-700" : tone==="amber" ? "text-amber-700" : "text-slate-900";
  return <div className="ui-card p-4">
    <div className="text-sm font-black text-slate-600">{label}</div>
    <div className={`mt-2 text-3xl font-black ${color}`}>{value}</div>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>;
}
