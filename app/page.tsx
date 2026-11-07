import type { Metadata } from "next";
import PublicHome from "@/components/public/public-home";
import { branches, branchJsonLd, faqPageJsonLd, jsonLdString, SITE_URL } from "@/lib/public-content";

const TITLE = "Lớp nhảy trẻ em Bình Tân, Quận 6 | ANGEL BK";
const DESCRIPTION =
  "CLB nhảy hiphop & biểu diễn cho bé tại Bình Tân, Quận 6 TP.HCM. 2 cơ sở: 1033 Tỉnh Lộ 10 và 299A Tân Hòa Đông. Đăng ký học thử: 0933 309 336.";
const SAME_AS = [
  "https://www.facebook.com/clbangelbk",
  "https://www.youtube.com/channel/UC98nllDTvhCvs0ZoAYYolwA",
  "https://www.tiktok.com/@clbangelbk",
];

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "ANGEL BK",
    type: "website",
    locale: "vi_VN",
    images: [{ url: "/images/angelbk/hero/angel-bk-dance-crew.webp", alt: "Đội nhảy thiếu nhi ANGEL BK" }],
  },
};

// JSON-LD chỉ chứa dữ liệu thật: phường, giờ mở cửa, FAQ... lấy từ
// lib/public-content.ts và tự bỏ qua mọi ô còn là TODO_OWNER.
const faqPage = faqPageJsonLd();

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "ANGEL BK",
      alternateName: "CLB nhảy Angel BK",
      url: SITE_URL,
      logo: `${SITE_URL}/images/angelbk/brand/angel-bk-logo.webp`,
      telephone: "+84933309336",
      slogan: "Mỗi bước nhảy – một bước trưởng thành.",
      sameAs: SAME_AS,
    },
    ...branches.map((branch) => branchJsonLd(branch, SAME_AS)),
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "ANGEL BK",
      inLanguage: "vi-VN",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    ...(faqPage ? [faqPage] : []),
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <PublicHome />
    </>
  );
}
