"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  id: string;
  name: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  branch_id: string | null;
  email?: string | null;
};

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const loadRequestRef = useRef(0);

  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();

    if (requestId !== loadRequestRef.current) return;

    if (!authData.user) {
      setLoading(false);
      return;
    }

    const [{ data: myProfile }, { data: branchData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,full_name,role,branch_id")
        .eq("id", authData.user.id)
        .single(),

      supabase
        .from("branches")
        .select("id,name")
        .order("name"),
    ]);

    if (requestId !== loadRequestRef.current) return;

    if (!myProfile) {
      setLoading(false);
      return;
    }

    const current = {
      ...myProfile,
      email: authData.user.email,
    };

    setMe(current);
    setBranches(branchData ?? []);

    if (myProfile.role === "admin") {
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id,full_name,role,branch_id");

      if (requestId !== loadRequestRef.current) return;

      setProfiles(allProfiles ?? []);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function branchName(id: string | null) {
    return branches.find((b) => b.id === id)?.name ?? "Toàn CLB";
  }

  async function updateProfile(
    id: string,
    role: string,
    branchId: string
  ) {
    setSaving(id);

    const { error } = await supabase
      .from("profiles")
      .update({
        role,
        branch_id: branchId || null,
      })
      .eq("id", id);

    setSaving(null);

    if (error) {
      alert(error.message);
      return;
    }

    alert("✅ Đã cập nhật phân quyền.");
    await loadData();
  }

  if (loading) {
    return <div className="p-8">Đang tải cài đặt...</div>;
  }

  const isAdmin = me?.role === "admin";

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-bold uppercase tracking-wider text-blue-600">
          ⚙️ HỆ THỐNG
        </div>
        <h1 className="mt-1 text-3xl font-black text-slate-900">
          Cài đặt & phân quyền
        </h1>
        <p className="mt-2 text-slate-500">
          Quản lý tài khoản, vai trò và cơ sở được phép truy cập.
        </p>
      </div>

      <section className="ui-card p-6">
        <h2 className="text-xl font-black">👤 Tài khoản của tôi</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-400">HỌ VÀ TÊN</div>
            <div className="mt-1 font-bold">
              {me?.full_name || "Chưa cập nhật"}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-400">EMAIL</div>
            <div className="mt-1 font-bold">
              {me?.email || "—"}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-400">
              QUYỀN TRUY CẬP
            </div>
            <div className="mt-1 font-bold">
              {me?.role === "admin" ? "👑 Admin" : "👤 Manager"}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-blue-50 p-4">
          <div className="text-xs font-bold text-blue-500">
            CƠ SỞ ĐƯỢC QUẢN LÝ
          </div>
          <div className="mt-1 font-black text-blue-900">
            {branchName(me?.branch_id ?? null)}
          </div>
        </div>
      </section>

      <section className="ui-card p-6">
        <h2 className="text-xl font-black">🔐 Quyền hệ thống</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-5">
            <div className="text-lg font-black">👑 Admin</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>✓ Quản lý toàn bộ cơ sở</li>
              <li>✓ Quản lý học viên, lớp, điểm danh</li>
              <li>✓ Quản lý học phí, thu chi</li>
              <li>✓ Xem toàn bộ báo cáo</li>
              <li>✓ Quản lý tài khoản Manager</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 p-5">
            <div className="text-lg font-black">👤 Manager</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>✓ Quản lý cơ sở được phân công</li>
              <li>✓ Quản lý học viên và lớp của cơ sở</li>
              <li>✓ Điểm danh</li>
              <li>✓ Thu học phí</li>
              <li>✓ Quản lý chi phí của cơ sở</li>
              <li>✓ Xem báo cáo của cơ sở</li>
            </ul>
          </div>
        </div>
      </section>

      {isAdmin && (
        <section className="ui-card overflow-hidden">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-xl font-black">👥 Quản lý tài khoản</h2>
            <p className="mt-1 text-sm text-slate-500">
              Chỉ Admin mới có thể thay đổi quyền và cơ sở.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="grid gap-4 p-5 md:grid-cols-[1fr_180px_220px_110px] md:items-center"
              >
                <div>
                  <div className="font-black">
                    {profile.full_name || "Chưa đặt tên"}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {profile.id === me?.id ? "Tài khoản hiện tại" : "Tài khoản Manager/Admin"}
                  </div>
                </div>

                <select
                  className="ui-input"
                  value={profile.role || "manager"}
                  disabled={profile.id === me?.id}
                  onChange={(e) => {
                    setProfiles((old) =>
                      old.map((x) =>
                        x.id === profile.id
                          ? { ...x, role: e.target.value }
                          : x
                      )
                    );
                  }}
                >
                  <option value="manager">👤 Manager</option>
                  <option value="admin">👑 Admin</option>
                </select>

                <select
                  className="ui-input"
                  value={profile.branch_id || ""}
                  disabled={profile.id === me?.id || profile.role === "admin"}
                  onChange={(e) => {
                    setProfiles((old) =>
                      old.map((x) =>
                        x.id === profile.id
                          ? { ...x, branch_id: e.target.value || null }
                          : x
                      )
                    );
                  }}
                >
                  <option value="">🏢 Toàn CLB</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>

                <button
                  className="ui-btn ui-btn-primary"
                  disabled={saving === profile.id || profile.id === me?.id}
                  onClick={() =>
                    updateProfile(
                      profile.id,
                      profile.role || "manager",
                      profile.branch_id || ""
                    )
                  }
                >
                  {saving === profile.id ? "Lưu..." : "Lưu"}
                </button>
              </div>
            ))}

            {profiles.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                Chưa có tài khoản trong profiles.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
