import type { Metadata } from "next";
import PublicHome from "@/components/public/public-home";

const SITE_URL = "https://angelbk.vn";
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

// Only facts already published on the site. Ward, opening hours, geo and
// prices are intentionally omitted until the owner confirms them.
const branch = (id: string, name: string, street: string) => ({
  "@type": "DanceSchool",
  "@id": `${SITE_URL}/#${id}`,
  name,
  url: SITE_URL,
  telephone: "+84933309336",
  image: `${SITE_URL}/images/angelbk/hero/angel-bk-dance-crew.webp`,
  address: {
    "@type": "PostalAddress",
    streetAddress: street,
    addressLocality: "TP. Hồ Chí Minh",
    addressCountry: "VN",
  },
  areaServed: ["Bình Tân", "Quận 6", "TP. Hồ Chí Minh"],
  parentOrganization: { "@id": `${SITE_URL}/#organization` },
  sameAs: SAME_AS,
});

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
    branch("co-so-1", "ANGEL BK – Cơ sở 1 (Tỉnh Lộ 10)", "1033 Tỉnh Lộ 10"),
    branch("co-so-2", "ANGEL BK – Cơ sở 2 (Tân Hòa Đông)", "299A Tân Hòa Đông"),
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "ANGEL BK",
      inLanguage: "vi-VN",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PublicHome />
    </>
  );
}
