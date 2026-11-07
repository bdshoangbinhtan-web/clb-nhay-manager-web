import Image from "next/image";
import Link from "next/link";
import { branchAddress, branches, PHONE_DISPLAY, programPath, type Program } from "@/lib/public-content";
import "./public-home.css";

/** Khung chung cho các trang công khai phụ (/lop-hoc, /lop-hoc/[slug]). */

const SIGNUP_HREF = "/#dang-ky";
const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`ANGEL BK ${address}`)}`;

export function PublicSubpage({ children }: { children: React.ReactNode }) {
  return (
    <div className="abk-public abk-subpage">
      <header className="abk-header">
        <Link className="abk-logo" href="/" aria-label="ANGEL BK — Trang chủ">
          <Image src="/images/angelbk/brand/angel-bk-logo.webp" alt="ANGEL BK" width={720} height={675} priority />
        </Link>
        <nav className="abk-subpage-nav" aria-label="Điều hướng chính">
          <Link href="/lop-hoc">Lớp học</Link>
          <Link href="/#giao-vien">Giáo viên</Link>
          <Link href="/#co-so">Cơ sở</Link>
          <a className="abk-button abk-button-small" href={SIGNUP_HREF}>Đăng ký học thử</a>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="abk-footer">
        <div className="abk-footer-brand"><Image src="/images/angelbk/brand/angel-bk-logo.webp" alt="ANGEL BK" width={160} height={80} /><p>Mỗi bước nhảy — một bước trưởng thành.</p></div>
        <div><h3>Địa chỉ</h3>{branches.map((branch) => <p key={branch.id}><b>{branch.name}</b> · <a href={mapsUrl(branchAddress(branch))} target="_blank" rel="noopener noreferrer">{branchAddress(branch)}</a></p>)}</div>
        <div><h3>Liên hệ</h3><a href="tel:0933309336">{PHONE_DISPLAY}</a><a href="https://video.angelbk.vn">Video của bé ↗</a></div>
        <a className="abk-button abk-button-light" href={SIGNUP_HREF}>Đăng ký học thử</a>
        <p className="abk-copyright">© {new Date().getFullYear()} ANGEL BK. All moves reserved.</p>
      </footer>

      <div className="abk-mobile-actions">
        <a className="abk-mobile-primary" href={SIGNUP_HREF}>Đăng ký học thử ↗</a>
        <a href="tel:0933309336">Gọi {PHONE_DISPLAY}</a>
      </div>
    </div>
  );
}

export function SignupLink({ light = false }: { light?: boolean }) {
  return <a className={light ? "abk-button abk-button-light" : "abk-button"} href={SIGNUP_HREF}>Đăng ký học thử <b>↗</b></a>;
}

export function ProgramLinkCard({ program, index }: { program: Program; index: number }) {
  return (
    <article className="abk-program-card">
      <Link className="abk-program-image" href={programPath(program)} tabIndex={-1} aria-hidden="true">
        <Image src={program.image} alt={program.title} fill sizes="(max-width: 800px) 100vw, 50vw" style={{ objectPosition: program.crop }} />
        <span>0{index + 1}</span>
      </Link>
      <div className="abk-program-copy">
        <p>{program.label}</p>
        <h3><Link href={programPath(program)}>{program.title}</Link></h3>
        <span>{program.description}</span>
        <div className="abk-program-actions">
          <Link href={programPath(program)}>Xem chi tiết lớp <b>→</b></Link>
        </div>
      </div>
    </article>
  );
}
