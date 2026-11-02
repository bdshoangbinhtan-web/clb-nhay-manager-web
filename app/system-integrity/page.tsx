"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getIntegrityGuide } from "@/lib/system-integrity-guide";

type Severity = "info" | "warning" | "error" | "critical";
type IssueStatus = "open" | "resolved" | "all";

type CheckResult = {
  key: string;
  status: "passed" | "failed";
  issues: number;
};

type IntegrityRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed";
  total_checks: number;
  passed_checks: number;
  info_count: number;
  warning_count: number;
  error_count: number;
  critical_count: number;
  issue_count: number;
  duration_ms: number | null;
  check_results: CheckResult[];
  error_message: string | null;
};

type IntegrityIssue = {
  id: string;
  check_key: string;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  entity_type: string;
  entity_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  branch_id: string | null;
  branch_name: string | null;
  related_date: string | null;
  context: Record<string, unknown>;
  fingerprint: string;
  status: "open" | "resolved";
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  occurrence_count: number;
};

type IssueStats = {
  total: number;
  info_count: number;
  warning_count: number;
  error_count: number;
  critical_count: number;
};

type DashboardResult = {
  latest_run: IntegrityRun | null;
  issues: IntegrityIssue[];
  issue_stats: IssueStats;
  history: IntegrityRun[];
  page: number;
  page_size: number;
  has_more: boolean;
};

const PAGE_SIZE = 50;

const categoryLabels: Record<string, string> = {
  class_sessions: "Buổi học",
  teacher_payroll: "Giáo viên / Lương",
  substitution: "Dạy thay",
  tuition: "Học phí",
};

const severityInfo: Record<Severity, { label: string; badge: string; border: string }> = {
  critical: {
    label: "Cần kiểm tra ngay",
    badge: "bg-rose-100 text-rose-700",
    border: "border-rose-200",
  },
  error: {
    label: "Cần xử lý",
    badge: "bg-orange-100 text-orange-700",
    border: "border-orange-200",
  },
  warning: {
    label: "Cần lưu ý",
    badge: "bg-amber-100 text-amber-700",
    border: "border-amber-200",
  },
  info: {
    label: "Thông tin",
    badge: "bg-blue-100 text-blue-700",
    border: "border-blue-200",
  },
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatContextValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return new Intl.NumberFormat("vi-VN").format(value);
  }
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function formatMoney(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

function formatMonth(value: unknown) {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const [year, month] = raw.split("-");
  if (!year || !month) return String(value);
  return `Tháng ${Number(month)}/${year}`;
}

function paymentMethodLabel(value: unknown) {
  const method = String(value || "").toLowerCase();
  if (method === "cash") return "Tiền mặt";
  if (method === "transfer" || method === "bank_transfer") return "Chuyển khoản";
  return value ? String(value) : "—";
}

function getContextRecord(issue: IntegrityIssue) {
  return (issue.context || {}) as Record<string, unknown>;
}

function isTuitionPaymentMismatch(issue: IntegrityIssue) {
  const context = getContextRecord(issue);
  return (
    issue.category === "tuition" &&
    (issue.fingerprint.includes("PAYMENT_TOTAL_MISMATCH") ||
      (context.payment_total !== undefined && context.amount_paid !== undefined))
  );
}

function issueSubject(issue: IntegrityIssue) {
  const context = getContextRecord(issue);
  const person = context.teacher_name || context.student_name;
  const className = context.class_name;
  const period = context.payroll_month || context.billing_month;
  const parts = [
    person ? String(person) : null,
    className ? String(className) : null,
    period ? formatMonth(period) : issue.related_date ? formatDate(issue.related_date) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Trường hợp cần kiểm tra";
}

function issueMoneyDifference(issue: IntegrityIssue) {
  const context = getContextRecord(issue);
  if (issue.check_key === "PAY001_PAYROLL_TOTAL_MISMATCH") {
    const total = Number(context.total_amount);
    const detail = Number(context.detail_total);
    return Number.isFinite(total) && Number.isFinite(detail) ? total - detail : null;
  }
  if (issue.check_key === "TUI001_TUITION_OVERPAID") {
    const paid = Number(context.amount_paid);
    const due = Number(context.amount_due);
    return Number.isFinite(paid) && Number.isFinite(due) ? paid - due : null;
  }
  if (issue.check_key === "TUI002_PAYMENT_TOTAL_MISMATCH") {
    const total = Number(context.payment_total);
    const paid = Number(context.amount_paid);
    return Number.isFinite(total) && Number.isFinite(paid) ? total - paid : null;
  }
  return null;
}

function durationLabel(value: number | null) {
  if (value === null) return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} giây`;
}

export default function SystemIntegrityPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const requestRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [latestRun, setLatestRun] = useState<IntegrityRun | null>(null);
  const [history, setHistory] = useState<IntegrityRun[]>([]);
  const [issues, setIssues] = useState<IntegrityIssue[]>([]);
  const [issueStats, setIssueStats] = useState<IssueStats>({
    total: 0,
    info_count: 0,
    warning_count: 0,
    error_count: 0,
    critical_count: 0,
  });
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<IssueStatus>("open");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIssue, setSelectedIssue] = useState<IntegrityIssue | null>(null);
  const [selectedRun, setSelectedRun] = useState<IntegrityRun | null>(null);

  const groupedIssues = useMemo(() => {
    const groups = new Map<string, IntegrityIssue[]>();
    for (const issue of issues) {
      const items = groups.get(issue.check_key) ?? [];
      items.push(issue);
      groups.set(issue.check_key, items);
    }
    return [...groups.entries()].map(([checkKey, items]) => ({ checkKey, items }));
  }, [issues]);

  useEffect(() => {
    let cancelled = false;

    async function authorize() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", userData.user.id)
        .single();

      if (cancelled) return;
      if (profile?.role !== "admin" || !profile.is_active) {
        router.push("/dashboard");
        return;
      }

      setReady(true);
    }

    void authorize();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const loadDashboard = useCallback(async (targetPage: number, append: boolean) => {
    const requestId = ++requestRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError("");

    const { data, error } = await supabase.rpc(
      "get_system_integrity_dashboard",
      {
        p_issue_status: statusFilter,
        p_severity: severityFilter === "all" ? null : severityFilter,
        p_category: categoryFilter === "all" ? null : categoryFilter,
        p_page: targetPage,
        p_page_size: PAGE_SIZE,
      }
    );

    if (requestId !== requestRef.current) return;
    if (error) {
      setLoadError(`Không tải được dữ liệu kiểm tra: ${error.message}`);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const result = data as DashboardResult;
    setLatestRun(result?.latest_run ?? null);
    setHistory(result?.history ?? []);
    setIssues((current) => append
      ? [...current, ...(result?.issues ?? [])]
      : (result?.issues ?? []));
    setIssueStats(result?.issue_stats ?? {
      total: 0,
      info_count: 0,
      warning_count: 0,
      error_count: 0,
      critical_count: 0,
    });
    setPage(targetPage);
    setHasMore(Boolean(result?.has_more));
    setLoading(false);
    setLoadingMore(false);
  }, [categoryFilter, severityFilter, statusFilter, supabase]);

  useEffect(() => {
    if (!ready) return;
    setIssues([]);
    setPage(1);
    void loadDashboard(1, false);
  }, [ready, loadDashboard]);

  async function runChecks() {
    if (running) return;
    setRunning(true);
    setLoadError("");

    const { data, error } = await supabase.rpc("run_system_integrity_checks");
    setRunning(false);

    if (error) {
      alert(`Không thể chạy kiểm tra: ${error.message}`);
      return;
    }

    const result = data as {
      success?: boolean;
      status?: string;
      issue_count?: number;
      error_message?: string;
    } | null;

    if (!result?.success) {
      alert(`Lần kiểm tra thất bại: ${result?.error_message || "Lỗi không xác định"}`);
    } else {
      alert(`Kiểm tra hoàn tất. Phát hiện ${result.issue_count ?? 0} vấn đề.`);
    }

    setIssues([]);
    setPage(1);
    await loadDashboard(1, false);
  }

  if (!ready && loading) {
    return (
      <div className="ui-card p-12 text-center text-slate-400">
        Đang kiểm tra quyền Admin...
      </div>
    );
  }

  const summary = [
    {
      label: "Mục kiểm tra đạt",
      value: latestRun?.passed_checks ?? 0,
      color: "text-emerald-700",
      background: "bg-emerald-50",
    },
    {
      label: "Cảnh báo cần lưu ý",
      value: latestRun?.warning_count ?? 0,
      color: "text-amber-700",
      background: "bg-amber-50",
    },
    {
      label: "Vấn đề cần xử lý",
      value: latestRun?.error_count ?? 0,
      color: "text-orange-700",
      background: "bg-orange-50",
    },
    {
      label: "Cần kiểm tra ngay",
      value: latestRun?.critical_count ?? 0,
      color: "text-rose-700",
      background: "bg-rose-50",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-bold uppercase tracking-wider text-blue-600">
            Quản trị hệ thống
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Kiểm tra sức khỏe dữ liệu
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500 sm:text-base">
            Tìm các khoản lương, học phí và buổi học cần đối chiếu. Mỗi trường hợp đều có giải thích và hướng kiểm tra dễ hiểu.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void runChecks()}
          disabled={running}
          className="ui-btn ui-btn-primary min-w-48 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? "Đang kiểm tra..." : "Kiểm tra dữ liệu ngay"}
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div key={item.label} className={`ui-card p-5 ${item.background}`}>
            <div className="text-xs font-black tracking-wider text-slate-500">
              {item.label}
            </div>
            <div className={`mt-2 text-4xl font-black ${item.color}`}>
              {item.value}
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {item.label === "Mục kiểm tra đạt" ? "Số hạng mục không phát hiện bất thường" : "Số trường hợp cần đối chiếu"}
            </p>
          </div>
        ))}
      </section>

      <section className="ui-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">Lần kiểm tra gần nhất</h2>
            {latestRun ? (
              <p className="mt-1 text-sm text-slate-500">
                {formatDateTime(latestRun.started_at)} · {durationLabel(latestRun.duration_ms)} · {latestRun.total_checks} hạng mục
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">Chưa có lần kiểm tra nào.</p>
            )}
          </div>

          {latestRun && (
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${
              latestRun.status === "completed"
                ? "bg-emerald-100 text-emerald-700"
                : latestRun.status === "failed"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-blue-100 text-blue-700"
            }`}>
              {latestRun.status === "completed" ? "Hoàn tất" : latestRun.status === "failed" ? "Thất bại" : "Đang chạy"}
            </span>
          )}
        </div>

        {latestRun && latestRun.status === "completed" && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
            <b>{latestRun.passed_checks}/{latestRun.total_checks} hạng mục đạt.</b>{" "}
            Những con số ở các ô còn lại là số trường hợp cần xem lại, không phải số lần hệ thống hỏng.
          </p>
        )}

        {latestRun?.status === "failed" && latestRun.error_message && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {latestRun.error_message}
          </div>
        )}
      </section>

      <section className="ui-card p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as IssueStatus)}
              className="ui-input mt-1"
            >
              <option value="open">Chưa hết bất thường</option>
              <option value="resolved">Đã hết bất thường</option>
              <option value="all">Tất cả</option>
            </select>
          </label>

          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Mức độ
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="ui-input mt-1"
            >
              <option value="all">Tất cả mức độ ưu tiên</option>
              <option value="critical">Cần kiểm tra ngay</option>
              <option value="error">Cần xử lý</option>
              <option value="warning">Cần lưu ý</option>
              <option value="info">Thông tin</option>
            </select>
          </label>

          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Nhóm nghiệp vụ
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="ui-input mt-1"
            >
              <option value="all">Tất cả nhóm</option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loadError && (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
          {loadError}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">Các trường hợp cần đối chiếu</h2>
            <p className="mt-1 text-sm text-slate-500">
              {issueStats.total} trường hợp theo bộ lọc hiện tại{issueStats.total > issues.length ? ` · Đang xem ${issues.length}` : ""}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="ui-card p-12 text-center text-slate-400">Đang tải kết quả...</div>
        ) : issues.length === 0 ? (
          <div className="ui-card p-10 text-center">
            <div className="text-lg font-black text-emerald-700">Không có vấn đề trong bộ lọc này</div>
            <p className="mt-2 text-sm text-slate-500">Hãy đổi bộ lọc hoặc chạy kiểm tra để xem tình trạng dữ liệu mới nhất.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedIssues.map(({ checkKey, items }) => {
              const guide = getIntegrityGuide(checkKey);
              return (
                <section key={checkKey} className="ui-card overflow-hidden border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50/70 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-lg font-black text-slate-900">{guide.title}</h3>
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-700 ring-1 ring-slate-200">
                        {items.length} trường hợp{issueStats.total > issues.length ? " đang hiển thị" : ""}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{guide.description}</p>
                    <p className="mt-2 text-sm leading-6 text-blue-800"><b>Nên kiểm tra:</b> {guide.nextStep}</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((issue) => {
                      const info = severityInfo[issue.severity];
                      const difference = issueMoneyDifference(issue);
                      return (
                        <article key={issue.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${info.badge}`}>{info.label}</span>
                              <span className="text-xs font-semibold text-slate-500">{categoryLabels[issue.category] || "Dữ liệu"}</span>
                              <span className="text-xs text-slate-400">{issue.status === "open" ? "Đang cần đối chiếu" : "Không còn phát hiện"}</span>
                            </div>
                            <p className="mt-2 font-black text-slate-900">{issueSubject(issue)}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {issue.branch_name ? `${issue.branch_name} · ` : ""}
                              Phát hiện gần nhất {formatDateTime(issue.last_detected_at)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 lg:justify-end">
                            {difference !== null && (
                              <div>
                                <div className="text-xs font-bold text-slate-500">Chênh lệch cần đối chiếu</div>
                                <div className="mt-1 text-lg font-black text-orange-700">{formatMoney(Math.abs(difference))}</div>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedIssue(issue)}
                              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700"
                            >
                              Xem chi tiết
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="border-t border-slate-100 px-5 py-3 text-sm">
                    <a className="font-black text-blue-700 hover:underline" href={guide.href}>Mở {guide.sectionName} để đối chiếu</a>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="text-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadDashboard(page + 1, true)}
              className="ui-btn ui-btn-light disabled:opacity-60"
            >
              {loadingMore ? "Đang tải..." : "Xem thêm"}
            </button>
          </div>
        )}
      </section>

      <details className="ui-card overflow-hidden">
        <summary className="cursor-pointer p-5 text-lg font-black text-slate-900">
          Xem lịch sử kiểm tra <span className="ml-2 text-sm font-normal text-slate-500">(30 lần gần nhất)</span>
        </summary>

        <div className="overflow-x-auto">
          <table className="ui-table min-w-[820px]">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Mục đạt</th>
                <th>Lưu ý</th>
                <th>Cần xử lý</th>
                <th>Ưu tiên</th>
                <th>Thời lượng</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={run.id}>
                  <td>{formatDateTime(run.started_at)}</td>
                  <td className="font-bold">{run.status === "completed" ? "Hoàn tất" : run.status === "failed" ? "Thất bại" : "Đang chạy"}</td>
                  <td className="font-black text-emerald-700">{run.passed_checks}</td>
                  <td className="font-black text-amber-700">{run.warning_count}</td>
                  <td className="font-black text-orange-700">{run.error_count}</td>
                  <td className="font-black text-rose-700">{run.critical_count}</td>
                  <td>{durationLabel(run.duration_ms)}</td>
                  <td>
                    <button type="button" onClick={() => setSelectedRun(run)} className="font-black text-blue-600 hover:text-blue-800">
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400">Chưa có lịch sử.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </details>

      {selectedIssue && (() => {
        const context = getContextRecord(selectedIssue);
        const paymentMismatch = isTuitionPaymentMismatch(selectedIssue);
        const paymentTotal = Number(context.payment_total);
        const amountPaid = Number(context.amount_paid);
        const difference =
          Number.isFinite(paymentTotal) && Number.isFinite(amountPaid)
            ? paymentTotal - amountPaid
            : null;
        const payments = Array.isArray(context.payments)
          ? (context.payments as Record<string, unknown>[])
          : [];

        return (
          <div className="ui-modal-backdrop" onClick={() => setSelectedIssue(null)}>
            <div className="ui-modal max-w-3xl" onClick={(event) => event.stopPropagation()}>
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
                <div>
                  <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${severityInfo[selectedIssue.severity].badge}`}>
                    {severityInfo[selectedIssue.severity].label}
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-slate-900">{getIntegrityGuide(selectedIssue.check_key).title}</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{issueSubject(selectedIssue)}</p>
                </div>
                <button type="button" onClick={() => setSelectedIssue(null)} className="rounded-full bg-slate-100 px-4 py-2 font-black text-slate-600">Đóng</button>
              </div>

              <div className="space-y-6 p-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Vấn đề được phát hiện</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{getIntegrityGuide(selectedIssue.check_key).description}</p>
                  <h3 className="mt-4 text-sm font-black text-slate-900">Bạn nên làm gì?</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{getIntegrityGuide(selectedIssue.check_key).nextStep}</p>
                  <a className="mt-3 inline-block text-sm font-black text-blue-700 hover:underline" href={getIntegrityGuide(selectedIssue.check_key).href}>
                    Mở {getIntegrityGuide(selectedIssue.check_key).sectionName} để đối chiếu
                  </a>
                </div>
                {selectedIssue.check_key === "PAY001_PAYROLL_TOTAL_MISMATCH" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="text-xs font-bold text-slate-500">Tổng bảng lương</div>
                        <div className="mt-2 text-xl font-black text-slate-900">{formatMoney(context.total_amount)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="text-xs font-bold text-slate-500">Tổng các buổi dạy</div>
                        <div className="mt-2 text-xl font-black text-slate-900">{formatMoney(context.detail_total)}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <div className="text-xs font-bold text-amber-700">Khoản cần đối chiếu</div>
                        <div className="mt-2 text-xl font-black text-amber-800">{issueMoneyDifference(selectedIssue) === null ? "—" : formatMoney(Math.abs(issueMoneyDifference(selectedIssue)!))}</div>
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-amber-800">
                      Lưu ý: Tổng bảng lương có thể bao gồm <b>phụ cấp</b>, trong khi tổng các buổi dạy chưa cộng phụ cấp. Vì vậy, chênh lệch này chưa chắc là sai dữ liệu.
                    </p>
                  </>
                ) : paymentMismatch ? (
                  <>
                    <div>
                      <div className="text-xl font-black text-slate-900">
                        {String(context.student_name || "Học viên chưa xác định")}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">
                        {[
                          context.class_name ? String(context.class_name) : null,
                          selectedIssue.branch_name || null,
                          context.billing_month ? formatMonth(context.billing_month) : null,
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-400">Học phí phải thu</div>
                        <div className="mt-2 text-2xl font-black text-slate-900">{formatMoney(context.amount_due)}</div>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 p-4">
                        <div className="text-xs font-black uppercase tracking-wide text-emerald-600">Đã ghi nhận thu</div>
                        <div className="mt-2 text-2xl font-black text-emerald-700">{formatMoney(context.amount_paid)}</div>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-4">
                        <div className="text-xs font-black uppercase tracking-wide text-blue-600">Tổng các phiếu thu</div>
                        <div className="mt-2 text-2xl font-black text-blue-700">{formatMoney(context.payment_total)}</div>
                        <div className="mt-1 text-xs font-bold text-blue-600">{Number(context.payment_count || payments.length || 0)} phiếu</div>
                      </div>
                      <div className={`rounded-2xl p-4 ${difference && difference !== 0 ? "bg-rose-50" : "bg-slate-50"}`}>
                        <div className={`text-xs font-black uppercase tracking-wide ${difference && difference !== 0 ? "text-rose-600" : "text-slate-400"}`}>Chênh lệch</div>
                        <div className={`mt-2 text-2xl font-black ${difference && difference !== 0 ? "text-rose-700" : "text-slate-900"}`}>
                          {difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatMoney(difference)}`}
                        </div>
                      </div>
                    </div>

                    {difference !== null && difference !== 0 && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-700">
                        Tổng các phiếu thu đang {difference > 0 ? "cao hơn" : "thấp hơn"} số tiền hệ thống ghi nhận đã thu {formatMoney(Math.abs(difference))}.
                      </div>
                    )}

                    {payments.length > 0 && (
                      <div>
                        <div className="mb-3 text-sm font-black text-slate-900">🧾 Các phiếu thu ({payments.length})</div>
                        <div className="space-y-2">
                          {payments.map((payment, index) => (
                            <div key={String(payment.payment_id || payment.id || index)} className="rounded-2xl border border-slate-200 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="font-black text-slate-900">{formatMoney(payment.amount)}</div>
                                  <div className="mt-1 text-sm text-slate-500">
                                    {[
                                      payment.payment_date ? formatDate(String(payment.payment_date)) : null,
                                      payment.payment_method ? paymentMethodLabel(payment.payment_method) : null,
                                    ].filter(Boolean).join(" · ")}
                                  </div>
                                </div>
                                <div className="text-sm font-bold text-slate-600">
                                  {String(payment.receipt_no || "Chưa có số phiếu")}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-6 text-slate-600">Hãy đối chiếu thông tin dưới đây trước khi chỉnh sửa.</p>
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div><span className="font-black text-slate-500">Nhóm:</span> {categoryLabels[selectedIssue.category] || selectedIssue.category}</div>
                      <div><span className="font-black text-slate-500">Cơ sở:</span> {selectedIssue.branch_name || "—"}</div>
                      <div><span className="font-black text-slate-500">Ngày:</span> {formatDate(selectedIssue.related_date)}</div>
                      <div><span className="font-black text-slate-500">Số lần gặp:</span> {selectedIssue.occurrence_count}</div>
                      <div><span className="font-black text-slate-500">Phát hiện đầu:</span> {formatDateTime(selectedIssue.first_detected_at)}</div>
                      <div><span className="font-black text-slate-500">Thấy gần nhất:</span> {formatDateTime(selectedIssue.last_detected_at)}</div>
                    </div>
                  </>
                )}

                <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer font-black text-slate-700">Xem dữ liệu kỹ thuật (dành cho người hỗ trợ)</summary>
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[180px_1fr]">
                      <code className="text-xs font-bold text-slate-500">check_key</code>
                      <pre className="whitespace-pre-wrap break-all text-xs text-slate-700">{selectedIssue.check_key}</pre>
                    </div>
                    <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[180px_1fr]">
                      <code className="text-xs font-bold text-slate-500">entity</code>
                      <pre className="whitespace-pre-wrap break-all text-xs text-slate-700">{selectedIssue.entity_type}: {selectedIssue.entity_id || "—"}</pre>
                    </div>
                    <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[180px_1fr]">
                      <code className="text-xs font-bold text-slate-500">related_entity</code>
                      <pre className="whitespace-pre-wrap break-all text-xs text-slate-700">{selectedIssue.related_entity_type || "—"}: {selectedIssue.related_entity_id || "—"}</pre>
                    </div>
                    {Object.entries(selectedIssue.context || {}).map(([key, value]) => (
                      <div key={key} className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[180px_1fr]">
                        <code className="text-xs font-bold text-slate-500">{key}</code>
                        <pre className="whitespace-pre-wrap break-all text-xs text-slate-700">{formatContextValue(value)}</pre>
                      </div>
                    ))}
                    <div className="grid gap-1 sm:grid-cols-[180px_1fr]">
                      <code className="text-xs font-bold text-slate-500">fingerprint</code>
                      <pre className="whitespace-pre-wrap break-all text-xs text-slate-700">{selectedIssue.fingerprint}</pre>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        );
      })()}

      {selectedRun && (
        <div className="ui-modal-backdrop" onClick={() => setSelectedRun(null)}>
          <div className="ui-modal max-w-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-blue-600">Lịch sử kiểm tra</div>
                <h2 className="mt-2 text-2xl font-black text-slate-900">{formatDateTime(selectedRun.started_at)}</h2>
              </div>
              <button type="button" onClick={() => setSelectedRun(null)} className="rounded-full bg-slate-100 px-3 py-2 font-black text-slate-600">Đóng</button>
            </div>

            <div className="space-y-4 p-6">
              {selectedRun.error_message && (
                <div className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{selectedRun.error_message}</div>
              )}
              {(selectedRun.check_results || []).map((result) => (
                <div key={result.key} className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-semibold text-slate-700">{getIntegrityGuide(result.key).title}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${result.status === "passed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {result.status === "passed" ? "Đạt" : `${result.issues} trường hợp`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
