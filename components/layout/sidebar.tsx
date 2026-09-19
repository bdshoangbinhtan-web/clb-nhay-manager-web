"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "admin" | "manager" | "teacher" | "";

const adminManagerMenus = [
  ["🏠", "Dashboard", "/dashboard"],

  ["🏢", "Cơ sở & Lớp", "/branches"],
  ["🏆", "Học viên", "/students"],
  ["✨", "Đăng ký học thử", "/dashboard/trial-leads"],
  ["👨‍🏫", "Giáo viên", "/teachers"],
  ["📋", "Điểm danh", "/attendance"],
  ["🎟️", "Quản lý học thử", "/trial-students"],
  ["💰", "Học phí", "/tuition"],
  ["💵", "Thu khác", "/other-revenue"],
  ["💵", "Lương giáo viên", "/teacher-payroll"],
  ["💸", "Chi phí", "/expenses"],
  ["📊", "Báo cáo", "/reports"],
  ["⚙️", "Cài đặt", "/settings"],
] as const;

const teacherMenus = [
  ["📚", "Lớp của tôi", "/teacher-classes"],
  ["📝", "Điểm danh học viên", "/teacher-student-attendance"],
  ["🎟️", "Học thử", "/teacher-trial-students"],
  ["✅", "Chấm công", "/teacher-session"],
  ["🔄", "Tôi dạy thay hôm nay", "/teacher-substitution"],
  ["💰", "Lương của tôi", "/teacher-salary"],

] as const;

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const supabase = createClient();

  const [role, setRole] = useState<Role>("");
  const [newLeadCount, setNewLeadCount] = useState(0);

  useEffect(() => {
    async function loadRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", user.id)
        .single();

      if (!profile?.is_active) return;

      setRole((profile.role ?? "") as Role);

      if (profile.role === "admin") {
        const { count } = await supabase
          .from("trial_class_leads")
          .select("id", { count: "exact", head: true })
          .eq("status", "new");

        setNewLeadCount(count ?? 0);
      }
    }

    loadRole();
  }, [supabase]);

  const menus =
    role === "teacher"
      ? teacherMenus
      : role === "admin" || role === "manager"
        ? adminManagerMenus
        : [];

  return (
    <>
      {open && (
        <button
          aria-label="Đóng menu"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
        />
      )}

      <aside
        className={`app-sidebar fixed left-0 top-0 z-50 flex h-screen w-[264px] flex-col overflow-hidden border-r border-white/80 bg-white/75 p-4 shadow-[8px_0_35px_rgba(35,50,75,.06)] backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 rounded-[24px] bg-white/85 px-5 py-5 shadow-[0_8px_25px_rgba(35,50,75,.07)]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 text-2xl shadow-[0_6px_0_rgba(15,23,42,.16)]">
              💃
            </div>

            <div>
              <div className="text-[17px] font-extrabold tracking-tight">
                CLB NHẢY
              </div>
              <div className="text-xs font-semibold text-slate-400">
                MANAGER V2
              </div>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
          {menus.map(([icon, label, href]) => {
            const active =
              pathname === href ||
              (href === "/attendance" &&
                pathname === "/attendance-history") ||
              (href === "/teachers" &&
                pathname === "/teacher-attendance") ||
              (href === "/branches" &&
                pathname.startsWith("/branches/"));

            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-[0_2px_0_rgba(148,163,184,0.18),0_4px_8px_rgba(15,23,42,0.05)] ${
                  active
                    ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-[0_7px_0_rgba(148,163,184,0.30),0_12px_22px_rgba(15,23,42,0.08)] active:translate-y-[3px]"
                    : "bg-transparent text-slate-800 hover:bg-white hover:text-slate-900 hover:shadow-[0_5px_0_rgba(148,163,184,0.20),0_9px_18px_rgba(15,23,42,0.06)]"
                }`}
              >
                <span className="text-lg">{icon}</span>
                <span>{label}</span>

                {href === "/dashboard/trial-leads" &&
                  newLeadCount > 0 && (
                    <span
                      className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-black ${
                        active
                          ? "bg-violet-100 text-violet-700"
                          : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {newLeadCount}
                    </span>
                  )}
              </Link>
            );
          })}

          {/* ADMIN ONLY */}
          {role === "admin" && (
            <>
              <div className="my-2 border-t border-slate-200" />

              <Link
                href="/activity-log"
                onClick={onClose}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-[0_2px_0_rgba(148,163,184,0.18),0_4px_8px_rgba(15,23,42,0.05)] ${
                  pathname === "/activity-log"
                    ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-[0_7px_0_rgba(148,163,184,0.30),0_12px_22px_rgba(15,23,42,0.08)] active:translate-y-[3px]"
                    : "bg-transparent text-slate-800 hover:bg-white hover:text-slate-900 hover:shadow-[0_5px_0_rgba(148,163,184,0.20),0_9px_18px_rgba(15,23,42,0.06)]"
                }`}
              >
                <span className="text-lg">🕵️</span>
                <span>Lịch sử hoạt động</span>
              </Link>

              <Link
                href="/system-integrity"
                onClick={onClose}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-[0_2px_0_rgba(148,163,184,0.18),0_4px_8px_rgba(15,23,42,0.05)] ${
                  pathname === "/system-integrity"
                    ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-[0_7px_0_rgba(148,163,184,0.30),0_12px_22px_rgba(15,23,42,0.08)] active:translate-y-[3px]"
                    : "bg-transparent text-slate-800 hover:bg-white hover:text-slate-900 hover:shadow-[0_5px_0_rgba(148,163,184,0.20),0_9px_18px_rgba(15,23,42,0.06)]"
                }`}
              >
                <span className="text-lg">🛡️</span>
                <span>Sức khỏe dữ liệu</span>
              </Link>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
