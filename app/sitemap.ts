import type { MetadataRoute } from "next";
import { programPath, programs, SITE_URL } from "@/lib/public-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/lop-hoc`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...programs.map((program) => ({
      url: `${SITE_URL}${programPath(program)}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
