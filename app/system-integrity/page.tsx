"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    label: "Nghiêm trọng",
    badge: "bg-rose-100 text-rose-700",
    border: "border-rose-200",
  },
  error: {
    label: "Lỗi",
    badge: "bg-orange-100 text-orange-700",
    border: "border-orange-200",
  },
  warning: {
    label: "Cảnh báo",
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
      label: "PASS",
      value: latestRun?.passed_checks ?? 0,
      color: "text-emerald-700",
      background: "bg-emerald-50",
    },
    {
      label: "WARNING",
      value: latestRun?.warning_count ?? 0,
      color: "text-amber-700",
      background: "bg-amber-50",
    },
    {
      label: "ERROR",
      value: latestRun?.error_count ?? 0,
      color: "text-orange-700",
      background: "bg-orange-50",
    },
    {
      label: "CRITICAL",
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
            Phát hiện sai lệch giữa buổi học, điểm danh, dạy thay, lương và học phí. Công cụ chỉ kiểm tra, không tự sửa dữ liệu nghiệp vụ.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void runChecks()}
          disabled={running}
          className="ui-btn ui-btn-primary min-w-48 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? "Đang kiểm tra..." : "Chạy kiểm tra ngay"}
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
          </div>
        ))}
      </section>

      <section className="ui-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">Lần kiểm tra gần nhất</h2>
            {latestRun ? (
              <p className="mt-1 text-sm text-slate-500">
                {formatDateTime(latestRun.started_at)} · {durationLabel(latestRun.duration_ms)} · {latestRun.total_checks} checks
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
              <option value="open">Đang mở</option>
              <option value="resolved">Đã xử lý</option>
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
              <option value="all">Tất cả mức độ</option>
              <option value="critical">Nghiêm trọng</option>
              <option value="error">Lỗi</option>
              <option value="warning">Cảnh báo</option>
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
            <h2 className="text-xl font-black text-slate-900">Danh sách vấn đề</h2>
            <p className="mt-1 text-sm text-slate-500">
              {issueStats.total} issue theo bộ lọc hiện tại
            </p>
          </div>
        </div>

        {loading ? (
          <div className="ui-card p-12 text-center text-slate-400">Đang tải kết quả...</div>
        ) : issues.length === 0 ? (
          <div className="ui-card p-10 text-center">
            <div className="text-lg font-black text-emerald-700">Không có issue phù hợp</div>
            <p className="mt-2 text-sm text-slate-500">Dữ liệu sạch theo các check và bộ lọc hiện tại.</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {issues.map((issue) => {
              const info = severityInfo[issue.severity];
              return (
                <article key={issue.id} className={`ui-card border p-5 ${info.border}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${info.badge}`}>
                          {info.label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                          {categoryLabels[issue.category] || issue.category}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          issue.status === "open"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {issue.status === "open" ? "OPEN" : "RESOLVED"}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-black text-slate-900">{issue.title}</h3>
                    </div>
                    <code className="max-w-full break-all rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                      {issue.check_key}
                    </code>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-600">{issue.description}</p>

                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div><span className="font-bold text-slate-500">Cơ sở:</span> {issue.branch_name || "—"}</div>
                    <div><span className="font-bold text-slate-500">Ngày:</span> {formatDate(issue.related_date)}</div>
                    <div><span className="font-bold text-slate-500">Phát hiện:</span> {formatDateTime(issue.first_detected_at)}</div>
                    <div><span className="font-bold text-slate-500">Số lần gặp:</span> {issue.occurrence_count}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedIssue(issue)}
                    className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-700"
                  >
                    Xem chi tiết
                  </button>
                </article>
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

      <section className="ui-card overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-xl font-black text-slate-900">Lịch sử kiểm tra</h2>
          <p className="mt-1 text-sm text-slate-500">30 lần chạy gần nhất, kể cả lần thất bại.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="ui-table min-w-[820px]">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>PASS</th>
                <th>WARNING</th>
                <th>ERROR</th>
                <th>CRITICAL</th>
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
      </section>

      {selectedIssue && (
        <div className="ui-modal-backdrop" onClick={() => setSelectedIssue(null)}>
          <div className="ui-modal max-w-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
              <div>
                <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${severityInfo[selectedIssue.severity].badge}`}>
                  {severityInfo[selectedIssue.severity].label}
                </div>
                <h2 className="mt-3 text-2xl font-black text-slate-900">{selectedIssue.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedIssue(null)} className="rounded-full bg-slate-100 px-3 py-2 font-black text-slate-600">Đóng</button>
            </div>

            <div className="space-y-6 p-6">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Check</div>
                <code className="mt-2 block break-all rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{selectedIssue.check_key}</code>
              </div>

              <p className="text-sm leading-6 text-slate-600">{selectedIssue.description}</p>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="font-black text-slate-500">Record:</span> {selectedIssue.entity_type}</div>
                <div className="break-all"><span className="font-black text-slate-500">Record ID:</span> {selectedIssue.entity_id || "—"}</div>
                <div><span className="font-black text-slate-500">Liên quan:</span> {selectedIssue.related_entity_type || "—"}</div>
                <div className="break-all"><span className="font-black text-slate-500">Related ID:</span> {selectedIssue.related_entity_id || "—"}</div>
                <div><span className="font-black text-slate-500">Phát hiện đầu:</span> {formatDateTime(selectedIssue.first_detected_at)}</div>
                <div><span className="font-black text-slate-500">Thấy gần nhất:</span> {formatDateTime(selectedIssue.last_detected_at)}</div>
                <div><span className="font-black text-slate-500">Đã xử lý:</span> {formatDateTime(selectedIssue.resolved_at)}</div>
                <div><span className="font-black text-slate-500">Số lần:</span> {selectedIssue.occurrence_count}</div>
              </div>

              <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer font-black text-slate-700">Xem dữ liệu kỹ thuật</summary>
                <div className="mt-4 space-y-3">
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
      )}

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
                  <code className="break-all text-xs font-bold text-slate-700">{result.key}</code>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${result.status === "passed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {result.status === "passed" ? "PASS" : `${result.issues} ISSUE`}
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
