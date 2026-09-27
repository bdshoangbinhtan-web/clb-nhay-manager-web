"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "angelbk-privacy-view";

type PrivacyViewContextValue = {
  privacyView: boolean;
  togglePrivacyView: () => void;
  role: "admin" | "manager" | "teacher" | "";
  branchId: string | null;
};

const PrivacyViewContext = createContext<PrivacyViewContextValue | null>(null);

export function PrivacyViewProvider({ children }: { children: React.ReactNode }) {
  const [privacyView, setPrivacyView] = useState(false);
  const [role, setRole] = useState<PrivacyViewContextValue["role"]>("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const privacyViewRef = useRef(false);

  useLayoutEffect(() => {
    let saved = false;
    try {
      saved = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Storage can be unavailable in a restricted browser session.
    }
    if (!saved) setReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = auth.user
        ? await supabase.from("profiles").select("role,is_active,branch_id").eq("id", auth.user.id).maybeSingle()
        : { data: null };
      if (!active) return;
      const nextRole = profile?.is_active && ["admin", "manager", "teacher"].includes(profile.role)
        ? profile.role as PrivacyViewContextValue["role"] : "";
      setRole(nextRole);
      setBranchId(nextRole === "manager" ? profile?.branch_id ?? null : null);
      const allowed = nextRole === "admin" || nextRole === "manager";
      let saved = false;
      try {
        saved = window.sessionStorage.getItem(STORAGE_KEY) === "1";
        if (!allowed) window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // Privacy View defaults to the full view if storage is unavailable.
      }
      privacyViewRef.current = allowed && saved;
      setPrivacyView(privacyViewRef.current);
      setReady(true);
    })();
    return () => { active = false; };
  }, []);

  const togglePrivacyView = useCallback(() => {
    if (role !== "admin" && role !== "manager") return;
    const next = !privacyViewRef.current;
    privacyViewRef.current = next;
    setPrivacyView(next);
    try {
      if (next) window.sessionStorage.setItem(STORAGE_KEY, "1");
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // The current tab still toggles even when storage is unavailable.
    }
  }, [role]);

  return (
    <PrivacyViewContext.Provider value={{ privacyView, togglePrivacyView, role, branchId }}>
      {ready ? children : null}
    </PrivacyViewContext.Provider>
  );
}

export function usePrivacyView() {
  const context = useContext(PrivacyViewContext);
  if (!context) throw new Error("Privacy View requires PrivacyViewProvider.");
  return context;
}
