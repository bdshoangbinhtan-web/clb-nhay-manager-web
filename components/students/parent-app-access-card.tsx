"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callFamilyBridge } from "@/lib/family-bridge";

export function ParentAppAccessCard({
  studentId,
  studentName,
  parentPhone,
}: {
  studentId: string;
  studentName: string;
  parentPhone: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || !active) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!active) return;

      setAllowed(
        Boolean(
          profile?.is_active &&
            (profile.role === "admin" || profile.role === "manager")
        )
      );
    });

    return () => {
      active = false;
    };
  }, [supabase]);

  if (!allowed) return null;

  async function provision(resetPin: boolean) {
    if (!parentPhone) {
      alert("Học viên chưa có SĐT phụ huynh.");
      return;
    }

    setBusy(true);
    setPin(null);
    setStatus("");

    try {
      const result = await callFamilyBridge(supabase, {
        action: "provision_parent",
        student_id: studentId,
        reset_pin: resetPin,
      });

      setPin(result.pin ?? null);
      setStatus(
        result.pin
          ? "Đã cấp mã mới. Gửi SĐT + mã 6 số này cho phụ huynh."
          : "Đã nối học viên vào Family. Phụ huynh đang có mã dùng chung."
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không cấp được mã.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (
      !confirm(
        `Thu hồi quyền vào app của SĐT ${parentPhone ?? ""}? Nếu cùng SĐT có nhiều bé, quyền của cả gia đình sẽ bị thu hồi.`
      )
    ) {
      return;
    }

    setBusy(true);
    setPin(null);
    setStatus("");

    try {
      await callFamilyBridge(supabase, {
        action: "revoke_parent",
        student_id: studentId,
      });
      setStatus("Đã thu hồi quyền vào app phụ huynh.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thu hồi được quyền.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ui-card min-w-0 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-blue-600">
            CLB ANGEL BK FAMILY
          </div>
          <h2 className="mt-1 text-xl font-black">🔐 Mã vào app phụ huynh</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {studentName} · {parentPhone || "Chưa có SĐT phụ huynh"}
          </p>
        </div>
      </div>

      {pin ? (
        <div className="mt-4 rounded-[22px] bg-blue-50 p-4 ring-1 ring-blue-200">
          <div className="text-center text-xs font-black uppercase tracking-wider text-blue-700">
            Mã vào app
          </div>
          <div className="mt-2 text-center text-4xl font-black tracking-[0.28em] text-slate-950">
            {pin}
          </div>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(pin)}
            className="ui-btn mt-3 min-h-11 w-full"
          >
            SAO CHÉP MÃ
          </button>
          <div className="mt-2 text-center text-xs font-bold text-slate-500">
            Mã chỉ hiện lúc vừa cấp/đặt lại.
          </div>
        </div>
      ) : null}

      {status ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {status}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          disabled={busy || !parentPhone}
          onClick={() => void provision(false)}
          className="ui-btn ui-btn-primary min-h-12 disabled:opacity-40"
        >
          {busy ? "ĐANG XỬ LÝ…" : "CẤP / NỐI APP"}
        </button>
        <button
          type="button"
          disabled={busy || !parentPhone}
          onClick={() => void provision(true)}
          className="ui-btn min-h-12 disabled:opacity-40"
        >
          ĐẶT LẠI MÃ
        </button>
        <button
          type="button"
          disabled={busy || !parentPhone}
          onClick={() => void revoke()}
          className="ui-btn min-h-12 text-red-700 disabled:opacity-40"
        >
          THU HỒI
        </button>
      </div>
    </section>
  );
}
