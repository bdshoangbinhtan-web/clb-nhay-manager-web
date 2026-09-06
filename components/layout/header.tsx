"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function Header({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[82px] items-center justify-between border-b border-white/80 bg-white/70 px-5 backdrop-blur-xl lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl shadow-[0_6px_18px_rgba(35,50,75,.08)] lg:hidden"
          aria-label="Mở menu"
        >
          ☰
        </button>

        <div>
          <div className="flex items-center gap-2 text-[17px] font-extrabold">
            🏢 Quản lý CLB
          </div>
          <div className="mt-0.5 text-xs font-medium text-slate-400">
            Hệ thống quản lý trung tâm
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg shadow-[0_6px_18px_rgba(35,50,75,.08)] sm:flex"
          aria-label="Thông báo"
        >
          🔔
        </button>

        <button
          onClick={logout}
          className="ui-btn ui-btn-light flex items-center gap-2"
        >
          🚪 <span>Đăng xuất</span>
        </button>
      </div>
    </header>
  );
}
