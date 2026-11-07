import type { Metadata } from "next";
import { ProgramLinkCard, PublicSubpage, SignupLink } from "@/components/public/public-subpage";
import { jsonLdString, PHONE_DISPLAY, programPath, programs, SITE_URL } from "@/lib/public-content";

const TITLE = "Các lớp nhảy hiphop cho bé tại Bình Tân – Quận 6 | ANGEL BK";
const DESCRIPTION = `Kids cơ bản, Kids nâng cao, Crew & biểu diễn và Lớp cuối tuần – các lớp nhảy hiphop cho bé tại ANGEL BK, Bình Tân – Quận 6 TP.HCM. Đăng ký học thử: ${PHONE_DISPLAY}.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/lop-hoc" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/lop-hoc`, siteName: "ANGEL BK", type: "website", locale: "vi_VN" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Các lớp nhảy tại ANGEL BK",
  itemListElement: programs.map((program, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: `${SITE_URL}${programPath(program)}`,
    name: `Lớp ${program.title}`,
  })),
};

export default function ProgramsPage() {
  return (
    <PublicSubpage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <section className="abk-section abk-programs abk-subpage-first">
        <div className="abk-section-intro">
          <div>
            <p className="abk-kicker">LỚP HỌC ANGEL BK</p>
            <h1 className="abk-subpage-title">Lớp nhảy hiphop cho bé<br /><em>tại Bình Tân – Quận 6.</em></h1>
          </div>
          <p>Từ những bước nền tảng đến sân khấu biểu diễn, mỗi chương trình đều giúp con vận động, kết nối và tự tin hơn.</p>
        </div>
        <div className="abk-program-grid">
          {programs.map((program, index) => <ProgramLinkCard key={program.slug} program={program} index={index} />)}
        </div>
        <div className="abk-subpage-cta-row"><SignupLink /></div>
      </section>
    </PublicSubpage>
  );
}
