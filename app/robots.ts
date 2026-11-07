import type { MetadataRoute } from "next";

// Public site is only the homepage; management app routes sit behind login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/login", "/dashboard", "/students", "/teachers", "/tuition", "/finance", "/reports", "/settings"],
      },
    ],
    sitemap: "https://angelbk.vn/sitemap.xml",
    host: "https://angelbk.vn",
  };
}
