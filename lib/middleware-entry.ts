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

export function entryRedirect(pathname: string, role: string | null): string | null {
  if (role === null) return pathname === "/" || pathname === "/login" ? null : "/login";
  if (pathname !== "/login") return null;
  return role === "teacher" ? "/teacher-classes" : "/dashboard";
}
