"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

const FAMILY_FUNCTION_URL =
  "https://efkkqhdyskhywtyydmyr.supabase.co/functions/v1/manager-family-bridge";

const FAMILY_PUBLISHABLE_KEY =
  "sb_publishable_lLNebXGjWpgdvbxZskpLfg_JcW4I9sY";

export async function callFamilyBridge(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  const response = await fetch(FAMILY_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: FAMILY_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result?.ok === false || result?.error) {
    const code = String(result?.error ?? "family_bridge_failed");
    const friendly: Record<string, string> = {
      student_parent_phone_missing:
        "Học viên chưa có số điện thoại phụ huynh.",
      forbidden: "Tài khoản này không có quyền thực hiện thao tác.",
      class_not_found: "Không tìm thấy lớp.",
      media_url_required: "Vui lòng chọn file hoặc dán liên kết bài học.",
      parent_pin_failed: "Chưa tạo được mã vào app.",
      manager_auth_invalid: "Phiên đăng nhập đã hết hạn.",
    };

    throw new Error(friendly[code] ?? code);
  }

  return result;
}
