"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const tabs = [
  { label: "Danh sách", href: "/students" },
  { label: "Điểm danh", href: "/students/attendance" },
  { label: "Lịch sử", href: "/students/history" },
] as const;

export function StudentModuleLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isStudentModulePage =
    pathname === "/students" ||
    pathname === "/students/attendance" ||
    pathname === "/students/history";

  if (!isStudentModulePage) return children;

  const activeHref =
    pathname === "/students/attendance"
      ? "/students/attendance"
      : pathname === "/students/history"
        ? "/students/history"
        : "/students";

  return (
    <div className="min-w-0 space-y-5 sm:space-y-7">
      <header className="min-w-0">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
          Học viên
        </h1>
        <p className="mt-2 text-sm text-slate-500 sm:text-base">
          Quản lý hồ sơ, điểm danh và lịch sử học viên
        </p>
      </header>

      <nav
        className="grid w-full grid-cols-3 gap-2 sm:w-fit"
        aria-label="Học viên"
      >
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`min-w-0 rounded-2xl border px-3 py-3 text-center text-sm font-black transition-[transform,box-shadow,background-color,color] duration-150 ease-out sm:px-5 ${
                active
                  ? "border-slate-200 bg-white text-slate-900 shadow-[0_7px_0_rgba(148,163,184,0.34),0_12px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.95)]"
                  : "border-slate-200/80 bg-slate-50/90 text-slate-600 shadow-[0_4px_0_rgba(148,163,184,0.20),0_8px_16px_rgba(15,23,42,0.05)] hover:bg-white hover:text-slate-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
