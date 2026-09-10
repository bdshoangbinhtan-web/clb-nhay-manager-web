"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const menus = [
  ["🏠", "Dashboard", "/dashboard"],
  ["🏢", "Cơ sở & Lớp", "/branches"],
  ["🏆", "Học viên", "/students"],
  ["👨‍🏫", "Giáo viên", "/teachers"],
  ["📋", "Điểm danh", "/attendance"],
  ["📋", "Điểm danh GV", "/teacher-attendance"],
  ["💰", "Học phí", "/tuition"],
  ["💵", "Lương giáo viên", "/teacher-payroll"],
  ["💸", "Chi phí", "/expenses"],
  ["📊", "Báo cáo", "/reports"],
  ["⚙️", "Cài đặt", "/settings"],
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

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function loadRole() {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      setIsAdmin(profile?.role === "admin");
    }

    loadRole();
  }, [supabase]);

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
        className={`app-sidebar fixed left-0 top-0 z-50 flex h-screen w-[264px] flex-col border-r border-white/80 bg-white/75 p-4 shadow-[8px_0_35px_rgba(35,50,75,.06)] backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 ${
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

        <nav className="flex flex-1 flex-col gap-2">
          {menus.map(([icon, label, href]) => {
            const active =
              pathname === href ||
              (href === "/branches" && pathname.startsWith("/branches/"));

            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  active
                    ? "bg-slate-900 !text-white shadow-[0_8px_18px_rgba(15,23,42,.14)]"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <span className="text-lg">{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}

          {/* ADMIN ONLY */}
          {isAdmin && (
            <>
              <div className="my-2 border-t border-slate-200" />

              <Link
                href="/activity-log"
                onClick={onClose}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  pathname === "/activity-log"
                    ? "bg-blue-600 !text-white shadow-[0_8px_18px_rgba(37,99,235,.20)]"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <span className="text-lg">🕵️</span>
                <span>Lịch sử hoạt động</span>
              </Link>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
