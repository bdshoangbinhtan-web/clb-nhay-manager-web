"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./sidebar";
import Header from "./header";
import MobileBottomNav from "./mobile-bottom-nav";
import { GlobalRealtimeProvider } from "@/components/realtime/global-realtime-provider";
import { PrivacyViewProvider, usePrivacyView } from "./privacy-view-context";
import PrivacyWorkspace from "./privacy-workspace";

function allowsPrivacyPath(pathname: string) {
  return ["/dashboard", "/branches", "/students", "/tuition", "/finance"].includes(pathname) ||
    /^\/(branches|students)\/[0-9a-f-]{36}$/i.test(pathname);
}

function ManagedApp({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const router = useRouter();
  const { privacyView } = usePrivacyView();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (privacyView && !allowsPrivacyPath(pathname)) router.replace("/dashboard");
  }, [pathname, privacyView, router]);

  return (
    <GlobalRealtimeProvider enabled={!privacyView}>
      <div className="min-h-screen">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="app-main ml-0 min-h-screen lg:ml-[264px]">
          <Header onMenu={() => setMenuOpen(true)} />
          <main className="px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-7 lg:pb-7">
            {privacyView ? <PrivacyWorkspace /> : children}
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </GlobalRealtimeProvider>
  );
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/") {
    return children;
  }

  return (
    <PrivacyViewProvider>
      <ManagedApp pathname={pathname}>{children}</ManagedApp>
    </PrivacyViewProvider>
  );
}
