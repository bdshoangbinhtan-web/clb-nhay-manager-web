import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgramLinkCard, PublicSubpage, SignupLink } from "@/components/public/public-subpage";
import {
  branchAddress,
  branches,
  courseJsonLd,
  getProgram,
  isKnown,
  jsonLdString,
  openingHoursLines,
  PHONE_DISPLAY,
  programBreadcrumbJsonLd,
  programFacts,
  programMetaDescription,
  programPath,
  programs,
  programTitleTag,
  SITE_URL,
} from "@/lib/public-content";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return programs.map((program) => ({ slug: program.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const program = getProgram(slug);
  if (!program) return {};
  const title = programTitleTag(program);
  const description = programMetaDescription(program);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: programPath(program) },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${programPath(program)}`,
      siteName: "ANGEL BK",
      type: "website",
      locale: "vi_VN",
      images: [{ url: program.image, alt: `Lớp ${program.title} – ANGEL BK` }],
    },
  };
}

export default async function ProgramPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const program = getProgram(slug);
  if (!program) notFound();

  const facts = programFacts(program);
  const longDescription = isKnown(program.longDescription) ? program.longDescription.filter((paragraph) => isKnown(paragraph)) : [];
  const highlights = isKnown(program.highlights) ? program.highlights.filter((item) => isKnown(item)) : [];
  const programBranches = isKnown(program.branchIds) ? branches.filter((branch) => (program.branchIds as string[]).includes(branch.id)) : [];
  const shownBranches = programBranches.length ? programBranches : branches;
  const otherPrograms = programs.filter((item) => item.slug !== program.slug);
  const jsonLd = { "@context": "https://schema.org", "@graph": [courseJsonLd(program), programBreadcrumbJsonLd(program)] };

  return (
    <PublicSubpage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      <section className="abk-course-hero">
        <div className="abk-course-hero-copy">
          <nav className="abk-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Trang chủ</Link><span>/</span><Link href="/lop-hoc">Lớp học</Link><span>/</span><span aria-current="page">{program.title}</span>
          </nav>
          <p className="abk-kicker">{program.label}</p>
          <h1>Lớp {program.title} cho bé tại Bình Tân – Quận 6 <span>| ANGEL BK</span></h1>
          <p className="abk-course-lead">{program.description}</p>
          <div className="abk-hero-actions">
            <SignupLink />
            <a className="abk-text-link" href="tel:0933309336">Gọi {PHONE_DISPLAY} <b>↗</b></a>
          </div>
        </div>
        <div className="abk-course-hero-image">
          <Image src={program.image} alt={`Học viên lớp ${program.title} tại ANGEL BK`} fill priority sizes="(max-width: 800px) 100vw, 50vw" style={{ objectPosition: program.crop }} />
        </div>
      </section>

      {facts.length > 0 && (
        <section className="abk-course-facts" aria-label="Thông tin lớp học">
          <dl>
            {facts.map((fact) => (
              <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
            ))}
          </dl>
        </section>
      )}

      {(longDescription.length > 0 || highlights.length > 0) && (
        <section className="abk-section abk-course-body">
          <div className="abk-course-text">
            <p className="abk-kicker">VỀ CHƯƠNG TRÌNH</p>
            <h2>Con sẽ học<br /><em>những gì?</em></h2>
            {longDescription.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          {highlights.length > 0 && (
            <ul className="abk-course-highlights">
              {highlights.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </section>
      )}

      <section className="abk-section abk-course-branches">
        <div className="abk-section-intro">
          <div><p className="abk-kicker">HỌC Ở ĐÂU</p><h2>{programBranches.length ? <>Cơ sở có lớp<br /><em>{program.title}.</em></> : <>Cơ sở<br /><em>ANGEL BK.</em></>}</h2></div>
          <p>ANGEL BK có 2 cơ sở tại khu vực Bình Tân – Quận 6, TP.HCM. Gọi {PHONE_DISPLAY} để được tư vấn lịch học phù hợp cho bé.</p>
        </div>
        <div className="abk-course-branch-grid">
          {shownBranches.map((branch, index) => (
            <article key={branch.id}>
              <span>0{index + 1}</span>
              <h3>{branch.name}</h3>
              <p>{branchAddress(branch)}</p>
              {openingHoursLines(branch).map((line) => <small key={line}>Giờ mở cửa · {line}</small>)}
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`ANGEL BK ${branchAddress(branch)}`)}`} target="_blank" rel="noopener noreferrer">Chỉ đường ↗</a>
            </article>
          ))}
        </div>
      </section>

      <section className="abk-course-cta">
        <div>
          <p className="abk-kicker">BƯỚC NHẢY ĐẦU TIÊN</p>
          <h2>Đăng ký học thử<br /><em>lớp {program.title}.</em></h2>
        </div>
        <p>Để lại thông tin, ANGEL BK sẽ liên hệ và tư vấn lớp phù hợp cho bé.</p>
        <SignupLink light />
      </section>

      <section className="abk-section abk-programs">
        <div className="abk-section-intro">
          <div><p className="abk-kicker">CHƯƠNG TRÌNH KHÁC</p><h2>Tìm nhịp điệu<br /><em>của con.</em></h2></div>
          <p>Từ những bước nền tảng đến sân khấu biểu diễn, mỗi chương trình đều giúp con vận động, kết nối và tự tin hơn.</p>
        </div>
        <div className="abk-program-grid">
          {otherPrograms.map((item) => <ProgramLinkCard key={item.slug} program={item} index={programs.indexOf(item)} />)}
        </div>
      </section>
    </PublicSubpage>
  );
}
