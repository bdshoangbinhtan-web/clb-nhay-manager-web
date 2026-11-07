/**
 * Files crawlers must fetch without logging in: robots.txt, sitemap.xml and
 * Google Search Console verification files (google<hex>.html).
 */
export function isPublicSeoFile(pathname: string): boolean {
  return (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /^\/google[0-9a-f]+\.html$/i.test(pathname)
  );
}

const PUBLIC_PAGES = new Set(["/", "/privacy", "/abk-family/privacy", "/delete-account", "/lop-hoc"]);

/**
 * Trang công khai cho mọi người (kể cả khi đã đăng nhập): trang chủ, chính sách,
 * và trang giới thiệu lớp học /lop-hoc, /lop-hoc/<slug>.
 * Dùng chung cho middleware.ts và components/layout/app-shell.tsx.
 */
export function isPublicPage(pathname: string): boolean {
  if (PUBLIC_PAGES.has(pathname)) return true;
  return /^\/lop-hoc\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(pathname);
}

export function entryRedirect(pathname: string, role: string | null): string | null {
  if (role === null) return isPublicPage(pathname) || pathname === "/login" ? null : "/login";
  if (pathname !== "/login") return null;
  return role === "teacher" ? "/teacher-classes" : "/dashboard";
}
