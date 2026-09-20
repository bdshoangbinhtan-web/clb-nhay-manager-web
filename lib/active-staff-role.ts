export type ActiveStaffRole = "admin" | "manager" | "";

export function activeStaffRole(
  profile: { is_active?: boolean | null; role?: string | null } | null | undefined
): ActiveStaffRole {
  if (profile?.is_active !== true) return "";
  return profile.role === "admin" || profile.role === "manager"
    ? profile.role
    : "";
}
