"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
];

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

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
                className={`group flex min-h-[50px] items-center gap-4 rounded-2xl px-4 text-[15px] font-semibold transition-all duration-150 ${
                  active
                    ? "bg-gradient-to-br from-slate-800 to-slate-950 text-white shadow-[0_7px_0_rgba(15,23,42,.22),0_12px_25px_rgba(15,23,42,.16)]"
                    : "text-slate-600 hover:-translate-y-0.5 hover:bg-white hover:text-slate-950 hover:shadow-[0_7px_18px_rgba(35,50,75,.08)]"
                }`}
              >
                <span className="w-6 text-center text-lg">{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="rounded-2xl bg-white/80 p-3 shadow-[0_8px_25px_rgba(35,50,75,.06)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-950 text-white">
              👤
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">Quản trị viên</div>
              <div className="text-xs text-slate-400">CLB NHẢY</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
