export function entryRedirect(pathname: string, role: string | null): string | null {
  if (role === null) return pathname === "/" || pathname === "/login" ? null : "/login";
  if (pathname !== "/login") return null;
  return role === "teacher" ? "/teacher-classes" : "/dashboard";
}
