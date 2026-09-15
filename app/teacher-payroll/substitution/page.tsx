"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RequestRow = {
  id: string;
  class_id: string;
  standing_teacher_id: string;
  substitute_teacher_id: string;
  session_date: string;
  status: string;
  note: string | null;
  classes: {
    name: string;
  } | null;
  standing_teacher: {
    full_name: string;
  } | null;
  substitute_teacher: {
    full_name: string;
  } | null;
};

function statusLabel(status: string) {
  if (status === "approved") return "Đã duyệt";
  if (status === "rejected") return "Từ chối";
  if (status === "cancelled") return "Đã hủy";
  return "Chờ duyệt";
}

export default function AdminSubstitutionPage() {
  const supabase = createClient();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("teacher_substitution_requests")
      .select(
        `
        id,
        class_id,
        standing_teacher_id,
        substitute_teacher_id,
        session_date,
        status,
        note,
        classes(name),
        standing_teacher:teachers!teacher_substitution_requests_standing_teacher_id_fkey(full_name),
        substitute_teacher:teachers!teacher_substitution_requests_substitute_teacher_id_fkey(full_name)
        `
      )
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setRequests((data ?? []) as unknown as RequestRow[]);
    setLoading(false);
  }

  async function updateRequest(id: string, status: "approved" | "rejected") {
    setProcessingId(id);
    setError("");
    setMessage("");

    const { error } = await supabase
      .from("teacher_substitution_requests")
      .update({ status })
      .eq("id", id)
      .eq("status", "pending");

    if (error) {
      setError(error.message);
      setProcessingId(null);
      return;
    }

    setMessage(
      status === "approved"
        ? "Đã duyệt yêu cầu dạy thay."
        : "Đã từ chối yêu cầu dạy thay."
    );

    await loadRequests();
    setProcessingId(null);
  }

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Duyệt dạy thay</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quản lý yêu cầu giáo viên đăng ký dạy thay.
          </p>
        </div>

        <a
          href="/teacher-payroll"
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          ← Lương giáo viên
        </a>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">
          {message}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              🟡 Yêu cầu chờ duyệt
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {pending.length} yêu cầu
            </p>
          </div>
        </div>

        {loading ? (
          <div className="mt-5 text-sm text-gray-500">
            Đang tải...
          </div>
        ) : pending.length === 0 ? (
          <div className="mt-5 rounded-xl bg-gray-50 p-5 text-sm text-gray-500">
            Hiện không có yêu cầu dạy thay nào đang chờ duyệt.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {pending.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border p-5"
              >
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <div className="text-xs text-gray-500">
                      Lớp
                    </div>
                    <div className="mt-1 font-semibold">
                      {request.classes?.name ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">
                      Giáo viên đứng lớp
                    </div>
                    <div className="mt-1 font-medium">
                      {request.standing_teacher?.full_name ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">
                      Giáo viên dạy thay
                    </div>
                    <div className="mt-1 font-medium">
                      {request.substitute_teacher?.full_name ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">
                      Ngày dạy
                    </div>
                    <div className="mt-1 font-medium">
                      {request.session_date}
                    </div>
                  </div>
                </div>

                {request.note && (
                  <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    {request.note}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={processingId === request.id}
                    onClick={() =>
                      updateRequest(request.id, "approved")
                    }
                    className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {processingId === request.id
                      ? "Đang xử lý..."
                      : "✓ Duyệt"}
                  </button>

                  <button
                    type="button"
                    disabled={processingId === request.id}
                    onClick={() =>
                      updateRequest(request.id, "rejected")
                    }
                    className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    ✕ Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">
          Lịch sử yêu cầu
        </h2>

        {history.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            Chưa có lịch sử.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-3">Lớp</th>
                  <th className="px-3 py-3">GV đứng lớp</th>
                  <th className="px-3 py-3">GV dạy thay</th>
                  <th className="px-3 py-3">Ngày</th>
                  <th className="px-3 py-3">Trạng thái</th>
                </tr>
              </thead>

              <tbody>
                {history.map((request) => (
                  <tr key={request.id} className="border-b">
                    <td className="px-3 py-3">
                      {request.classes?.name ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {request.standing_teacher?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {request.substitute_teacher?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {request.session_date}
                    </td>
                    <td className="px-3 py-3">
                      {statusLabel(request.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
