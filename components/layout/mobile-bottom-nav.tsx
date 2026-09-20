"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/mobile-ui";

type Role = "admin" | "manager" | "teacher" | "";
const primaryItems = [
  { label: "Trang chủ", icon: "⌂", href: "/dashboard", match: ["/dashboard"] },
  { label: "Học viên", icon: "♙", href: "/students", match: ["/students"] },
  { label: "Điểm danh", icon: "✓", href: "/attendance", match: ["/attendance", "/attendance-history"] },
  { label: "Học phí", icon: "₫", href: "/tuition", match: ["/tuition"] },
] as const;
const moreItems = [
  ["Cơ sở & lớp", "Lịch và danh sách lớp", "🏢", "/branches"],
  ["Giáo viên", "Quản lý đội ngũ", "👨‍🏫", "/teachers"], ["Lương", "Bảng lương giáo viên", "💵", "/teacher-payroll"],
  ["Chi phí", "Theo dõi khoản chi", "💸", "/expenses"], ["Thu khác", "Các khoản thu ngoài học phí", "💰", "/other-revenue"],
  ["Báo cáo", "Tổng hợp hoạt động", "📊", "/reports"],
  ["Học thử", "Quản lý học viên học thử", "🎟️", "/trial-students"], ["Sức khỏe dữ liệu", "Kiểm tra tính toàn vẹn", "🛡️", "/system-integrity"],
  ["Cài đặt", "Thiết lập hệ thống", "⚙️", "/settings"],
] as const;
const teacherItems = [
  ["Lớp", "📚", "/teacher-classes"], ["Điểm danh", "✓", "/teacher-student-attendance"],
  ["Học thử", "🎟️", "/teacher-trial-students"], ["Chấm công", "◷", "/teacher-session"],
] as const;

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<Role>("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [email, setEmail] = useState("");
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      if (mounted) setEmail(user.email ?? "");
      const { data } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
      if (mounted && data?.is_active) setRole((data.role ?? "") as Role);
    });
    return () => { mounted = false; };
  }, [supabase]);
  if (!role) return null;
  const isTeacher = role === "teacher";
  const visibleMoreItems = role === "admin"
    ? moreItems
    : moreItems.filter((item) => item[3] !== "/system-integrity" && item[3] !== "/teacher-payroll");
  const isMoreActive = !isTeacher && visibleMoreItems.some((item) => pathname.startsWith(item[3]));
  async function logout() {
    closeMore();
    await supabase.auth.signOut();
    router.replace("/login");
  }
  return <>
    <nav className="abk-bottom-nav lg:hidden" aria-label="Điều hướng chính">
      {isTeacher ? teacherItems.map(([label, icon, href]) => {
        const active = pathname.startsWith(href);
        return <Link key={href} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><span className="abk-nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></Link>;
      }) : primaryItems.map((item) => {
        const active = item.match.some((prefix) => pathname.startsWith(prefix));
        return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><span className="abk-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>;
      })}
      <button type="button" onClick={() => setMoreOpen(true)} className={isMoreActive || moreOpen ? "is-active" : ""} aria-expanded={moreOpen}><span className="abk-nav-icon" aria-hidden="true">•••</span><span>Thêm</span></button>
    </nav>
    <BottomSheet open={moreOpen} onClose={closeMore} title="Thêm" description="Các khu vực ít dùng hơn">
      <div className="grid grid-cols-2 gap-2">
        {(isTeacher ? [["Tất cả lớp", "Xem tất cả lớp được phân công", "🗓️", "/teacher-classes?view=all"], ["Dạy thay", "Lịch dạy thay", "🔄", "/teacher-substitution"], ["Lương của tôi", "Xem bảng lương", "💰", "/teacher-salary"]] as const : visibleMoreItems).map(([label, description, icon, href]) => <Link key={href} href={href} onClick={closeMore} className="abk-more-link"><span className="text-xl" aria-hidden="true">{icon}</span><span className="font-extrabold text-slate-900">{label}</span><span className="text-xs leading-4 text-slate-500">{description}</span></Link>)}
      </div>
      <div className="mt-4 border-t border-slate-200 px-1 pt-4">
        <div className="px-2 pb-3"><div className="text-xs font-black uppercase tracking-wide text-slate-400">Tài khoản</div>{email ? <div className="mt-1 truncate text-sm font-semibold text-slate-700">{email}</div> : null}</div>
        <button type="button" onClick={logout} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 font-extrabold text-slate-800">🚪 Đăng xuất</button>
      </div>
    </BottomSheet>
  </>;
}
