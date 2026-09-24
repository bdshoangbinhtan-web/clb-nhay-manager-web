"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "./public-home.css";

type FormState = {
  parentName: string;
  childName: string;
  age: string;
  phone: string;
  program: string;
  branch: string;
  note: string;
};

const initialForm: FormState = {
  parentName: "",
  childName: "",
  age: "",
  phone: "",
  program: "",
  branch: "",
  note: "",
};

const programs = [
  {
    title: "Kids cơ bản",
    label: "Nền tảng đầu tiên",
    description: "Làm quen nhịp điệu, kiểm soát cơ thể và xây dựng sự tự tin từ những chuyển động đầu tiên.",
    image: "/images/angelbk/programs/kids-dance-energy.webp",
    crop: "center 30%",
  },
  {
    title: "Kids nâng cao",
    label: "Nâng cấp kỹ năng",
    description: "Phát triển kỹ thuật, cá tính biểu diễn và khả năng làm việc cùng đội nhóm.",
    image: "/images/angelbk/programs/street-crew.webp",
    crop: "center 40%",
  },
  {
    title: "Crew & biểu diễn",
    label: "Cùng nhau tỏa sáng",
    description: "Rèn luyện trong đội hình, chinh phục sân khấu và lưu lại những trải nghiệm đáng nhớ.",
    image: "/images/angelbk/programs/studio-community.webp",
    crop: "center 44%",
  },
  {
    title: "Lớp cuối tuần",
    label: "Nhịp vui cuối tuần",
    description: "Một khoảng thời gian giàu năng lượng để con vận động, kết nối và thể hiện chính mình.",
    image: "/images/angelbk/programs/stage-solo.webp",
    crop: "center 34%",
  },
] as const;

const teachers = [
  { name: "Cô Nhung", image: "/images/angelbk/teachers/co-nhung.webp", crop: "center 22%" },
  { name: "Cô Nga", image: "/images/angelbk/teachers/co-nga.webp", crop: "center 18%" },
  { name: "Cô Thủy", image: "/images/angelbk/teachers/co-thuy.webp", crop: "center 16%" },
  { name: "Thầy Huy", image: "/images/angelbk/teachers/thay-huy.webp", crop: "center 18%" },
] as const;

const branches = [
  { name: "Cơ sở 1", address: "1033 Tỉnh Lộ 10", detail: "9 lớp đang hoạt động" },
  { name: "Cơ sở 2", address: "299A Tân Hòa Đông", detail: "13 lớp đang hoạt động" },
] as const;

function isValidAge(value: string) {
  const clean = value.trim();
  if (!clean) return false;
  const number = Number(clean);
  return !Number.isNaN(number)
    ? (number >= 3 && number <= 99) || (number >= 2000 && number <= new Date().getFullYear())
    : /^\d{1,2}\s*tuổi$/i.test(clean);
}

export default function PublicHome() {
  const supabase = useMemo(() => createClient(), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (submitState !== "idle") setSubmitState("idle");
  };

  const scrollToSignup = (program?: string) => {
    setMenuOpen(false);
    if (program) setForm((current) => ({ ...current, program }));
    requestAnimationFrame(() => {
      document.getElementById("dang-ky")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "loading") return;

    if (!form.parentName.trim() || !form.childName.trim() || !form.age.trim() || !form.phone.trim()) {
      setSubmitState("error");
      setMessage("Vui lòng điền đủ các trường bắt buộc.");
      return;
    }
    if (!isValidAge(form.age)) {
      setSubmitState("error");
      setMessage("Nhập tuổi hoặc năm sinh hợp lệ của bé.");
      return;
    }
    if (!/^[0-9+\s().-]{8,}$/.test(form.phone.trim())) {
      setSubmitState("error");
      setMessage("Vui lòng nhập số điện thoại hợp lệ.");
      return;
    }

    setSubmitState("loading");
    const details = [
      form.program && `Chương trình quan tâm: ${form.program}`,
      form.branch && `Cơ sở mong muốn: ${form.branch}`,
      form.note.trim(),
    ].filter(Boolean);
    const payload = {
      parent_name: form.parentName.trim(),
      child_name: form.childName.trim(),
      child_age_or_birth_year: form.age.trim(),
      phone: form.phone.trim(),
      class_id: null,
      branch_id: null,
      note: details.length ? details.join("\n") : null,
      status: "new",
    };
    const { error } = await supabase.from("trial_class_leads").insert(payload);

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Trial class lead insert failed", { message: error.message, code: error.code });
      }
      setSubmitState("error");
      setMessage("Chưa thể gửi đăng ký lúc này. Vui lòng gọi 0933 309 336 để được hỗ trợ.");
      return;
    }

    setSubmitState("success");
    setMessage("ANGEL BK đã nhận thông tin. Đội ngũ sẽ liên hệ với bạn sớm.");
    setForm(initialForm);
  }

  return (
    <div className="abk-public" id="dau-trang">
      <header className="abk-header">
        <a className="abk-logo" href="#dau-trang" aria-label="ANGEL BK — Trang chủ">
          <Image src="/images/angelbk/brand/angel-bk-logo.webp" alt="ANGEL BK" width={184} height={92} priority />
        </a>
        <button className="abk-menu-button" type="button" aria-label="Mở menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span /><span />
        </button>
        <nav className={menuOpen ? "abk-nav is-open" : "abk-nav"} aria-label="Điều hướng chính">
          <a href="#lop-hoc" onClick={() => setMenuOpen(false)}>Lớp học</a>
          <a href="#san-khau" onClick={() => setMenuOpen(false)}>Sân khấu</a>
          <a href="#giao-vien" onClick={() => setMenuOpen(false)}>Giáo viên</a>
          <a href="#co-so" onClick={() => setMenuOpen(false)}>Cơ sở</a>
          <a href="#hoat-dong" onClick={() => setMenuOpen(false)}>Hoạt động</a>
          <a className="abk-nav-video" href="https://video.angelbk.vn">Video của bé ↗</a>
          <button className="abk-button abk-button-small" type="button" onClick={() => scrollToSignup()}>Đăng ký học thử</button>
        </nav>
      </header>

      <main>
        <section className="abk-hero">
          <div className="abk-hero-copy">
            <p className="abk-kicker">CLB NHẢY DÀNH CHO TRẺ EM · TP.HCM</p>
            <h1><span>DANCE.</span><span>HIPHOP.</span><span>PERFORM.</span></h1>
            <p className="abk-hero-slogan">Mỗi bước nhảy —<br />một bước trưởng thành.</p>
            <div className="abk-hero-actions">
              <button className="abk-button" type="button" onClick={() => scrollToSignup()}>Đăng ký học thử <b>↗</b></button>
              <a className="abk-text-link" href="#lop-hoc">Khám phá lớp học <b>↓</b></a>
            </div>
          </div>
          <div className="abk-hero-image">
            <Image src="/images/angelbk/hero/angel-bk-dance-crew.webp" alt="Đội nhảy thiếu nhi ANGEL BK" fill priority sizes="(max-width: 800px) 100vw, 58vw" />
          </div>
        </section>

        <div className="abk-marquee" aria-label="Thông điệp ANGEL BK">
          <div>MOVE · GROW · SHINE · MOVE · GROW · SHINE · MOVE · GROW · SHINE ·</div>
        </div>

        <section className="abk-section abk-programs" id="lop-hoc">
          <SectionIntro eyebrow="TÌM NHỊP ĐIỆU CỦA CON" title={<>Một nơi để con<br /><em>bật chất riêng.</em></>} text="Từ những bước nền tảng đến sân khấu biểu diễn, mỗi chương trình đều giúp con vận động, kết nối và tự tin hơn." />
          <div className="abk-program-grid">
            {programs.map((program, index) => (
              <article className="abk-program-card" key={program.title}>
                <div className="abk-program-image">
                  <Image src={program.image} alt={program.title} fill sizes="(max-width: 800px) 100vw, 50vw" style={{ objectPosition: program.crop }} />
                  <span>0{index + 1}</span>
                </div>
                <div className="abk-program-copy">
                  <p>{program.label}</p>
                  <h3>{program.title}</h3>
                  <span>{program.description}</span>
                  <button type="button" onClick={() => scrollToSignup(program.title)}>Chọn chương trình <b>→</b></button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="abk-experience" id="co-so">
          <div className="abk-experience-gallery">
            <div className="abk-experience-main"><Image src="/images/angelbk/experience/teacher-coaching.webp" alt="Giáo viên ANGEL BK hướng dẫn học viên" fill sizes="(max-width: 800px) 100vw, 44vw" /></div>
            <div className="abk-experience-small"><Image src="/images/angelbk/experience/team-training.webp" alt="Các học viên cùng tập luyện tại ANGEL BK" fill sizes="(max-width: 800px) 54vw, 28vw" /></div>
          </div>
          <div className="abk-experience-copy">
            <p className="abk-kicker">KHÔNG GIAN ĐỂ LỚN LÊN</p>
            <h2>Tập hết mình.<br /><em>Vui đúng chất.</em></h2>
            <p>Mỗi buổi tập là một trải nghiệm có nhịp điệu, có đồng đội và có những cột mốc để con tự hào về chính mình.</p>
            <div className="abk-branch-list">
              {branches.map((branch, index) => (
                <article key={branch.name}>
                  <span>0{index + 1}</span>
                  <div><h3>{branch.name}</h3><p>{branch.address}</p><small>{branch.detail}</small></div>
                </article>
              ))}
            </div>
            <button className="abk-button abk-button-light" type="button" onClick={() => scrollToSignup()}>Chọn cơ sở gần bạn <b>→</b></button>
          </div>
        </section>

        <section className="abk-stage" id="san-khau">
          <div className="abk-stage-image">
            <Image src="/images/angelbk/stage/hiphop-performance.webp" alt="Học viên ANGEL BK biểu diễn trên sân khấu" fill sizes="100vw" />
          </div>
          <div className="abk-stage-overlay">
            <p className="abk-kicker">TỪ PHÒNG TẬP ĐẾN SÂN KHẤU</p>
            <h2>Không chỉ học nhảy.<br /><em>Con học cách tỏa sáng.</em></h2>
            <div className="abk-stage-steps"><span>01 <b>TRAIN</b></span><span>02 <b>PERFORM</b></span><span>03 <b>GROW</b></span></div>
          </div>
          <div className="abk-stage-card">
            <Image src="/images/angelbk/stage/kids-stage-crew.webp" alt="Nhóm học viên nhỏ tuổi ANGEL BK biểu diễn" fill sizes="(max-width: 800px) 62vw, 26vw" />
            <p>Sân khấu thật.<br /><strong>Kỷ niệm thật.</strong></p>
          </div>
        </section>

        <section className="abk-section abk-teachers" id="giao-vien">
          <SectionIntro eyebrow="NGƯỜI ĐỒNG HÀNH" title={<>Dẫn nhịp bằng<br /><em>chuyên môn & cảm hứng.</em></>} text="Đội ngũ giáo viên trực tiếp hướng dẫn, quan sát và giúp mỗi học viên tiến bộ theo nhịp độ riêng." />
          <div className="abk-teacher-grid">
            {teachers.map((teacher, index) => (
              <article className="abk-teacher-card" key={teacher.name}>
                <div><Image src={teacher.image} alt={teacher.name} fill sizes="(max-width: 800px) 50vw, 25vw" style={{ objectPosition: teacher.crop }} /></div>
                <p><span>0{index + 1}</span> GIÁO VIÊN</p>
                <h3>{teacher.name}</h3>
              </article>
            ))}
          </div>
        </section>

        <section className="abk-section abk-activities" id="hoat-dong">
          <SectionIntro eyebrow="MỖI HOẠT ĐỘNG, MỘT CÂU CHUYỆN" title={<>Vận động hôm nay.<br /><em>Kỷ niệm ngày mai.</em></>} text="Workshop, dự án hình ảnh và những hoạt động đặc biệt giúp thế giới của con rộng hơn sau mỗi bước nhảy." />
          <div className="abk-activity-grid">
            <article><Image src="/images/angelbk/activities/vietnam-concept.webp" alt="Hoạt động chủ đề Việt Nam của ANGEL BK" fill sizes="(max-width: 800px) 100vw, 50vw" /><div><span>CONCEPT PROJECT</span><h3>Chất Việt trong từng chuyển động.</h3></div></article>
            <article><Image src="/images/angelbk/activities/ao-dai-concept.webp" alt="Dự án áo dài của học viên ANGEL BK" fill sizes="(max-width: 800px) 100vw, 50vw" /><div><span>ANGEL BK MOMENTS</span><h3>Cá tính mới, cảm hứng mới.</h3></div></article>
          </div>
        </section>

        <section className="abk-video-cta">
          <div><p className="abk-kicker">VIDEO CỦA BÉ</p><h2>Khoảnh khắc của con.<br /><em>Một chạm để xem lại.</em></h2></div>
          <a className="abk-round-link" href="https://video.angelbk.vn" aria-label="Mở trang Video của bé">PLAY<br />↗</a>
          <p>Truy cập kho video riêng của ANGEL BK để tìm và xem lại những màn trình diễn đáng nhớ.</p>
        </section>

        <section className="abk-signup" id="dang-ky">
          <div className="abk-signup-visual">
            <Image src="/images/angelbk/cta/angel-bk-stage-community.webp" alt="Cộng đồng học viên ANGEL BK trên sân khấu" fill sizes="(max-width: 800px) 100vw, 48vw" />
            <div><span>READY?</span><strong>LET&apos;S<br />MOVE.</strong></div>
          </div>
          <div className="abk-signup-content">
            <p className="abk-kicker">BƯỚC NHẢY ĐẦU TIÊN</p>
            <h2>Đăng ký<br /><em>học thử.</em></h2>
            <p className="abk-signup-intro">Để lại thông tin, ANGEL BK sẽ liên hệ và tư vấn lớp phù hợp cho bé.</p>
            <form onSubmit={submit} noValidate>
              <div className="abk-form-grid">
                <Field label="Tên phụ huynh" value={form.parentName} onChange={(value) => update("parentName", value)} required />
                <Field label="Tên bé" value={form.childName} onChange={(value) => update("childName", value)} required />
                <Field label="Tuổi / năm sinh" value={form.age} onChange={(value) => update("age", value)} required placeholder="VD: 7 tuổi / 2019" />
                <Field label="Số điện thoại" value={form.phone} onChange={(value) => update("phone", value)} required inputMode="tel" />
                <SelectField label="Chương trình" value={form.program} onChange={(value) => update("program", value)} options={programs.map((program) => program.title)} />
                <SelectField label="Cơ sở" value={form.branch} onChange={(value) => update("branch", value)} options={branches.map((branch) => branch.name)} />
              </div>
              <label className="abk-field">Ghi chú<textarea rows={3} value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="Điều bạn muốn ANGEL BK biết thêm" /></label>
              {submitState !== "idle" && <p className={`abk-form-message ${submitState}`} role="status">{submitState === "loading" ? "Đang gửi đăng ký…" : message}</p>}
              <button className="abk-button abk-submit" type="submit" disabled={submitState === "loading"}>{submitState === "loading" ? "Đang gửi…" : "Gửi đăng ký"} <b>↗</b></button>
              <small>Bằng việc gửi biểu mẫu, bạn đồng ý để ANGEL BK liên hệ tư vấn lớp học.</small>
            </form>
          </div>
        </section>
      </main>

      <footer className="abk-footer">
        <div className="abk-footer-brand"><Image src="/images/angelbk/brand/angel-bk-logo.webp" alt="ANGEL BK" width={160} height={80} /><p>Mỗi bước nhảy — một bước trưởng thành.</p></div>
        <div><h3>Địa chỉ</h3>{branches.map((branch) => <p key={branch.name}><b>{branch.name}</b> · {branch.address}</p>)}</div>
        <div><h3>Liên hệ</h3><a href="tel:0933309336">0933 309 336</a><a href="https://video.angelbk.vn">Video của bé ↗</a></div>
        <button className="abk-button abk-button-light" type="button" onClick={() => scrollToSignup()}>Đăng ký học thử</button>
        <p className="abk-copyright">© {new Date().getFullYear()} ANGEL BK. All moves reserved.</p>
      </footer>

      <div className="abk-mobile-actions">
        <button type="button" onClick={() => scrollToSignup()}>Đăng ký học thử ↗</button>
        <a href="https://video.angelbk.vn">Video của bé ↗</a>
      </div>
    </div>
  );
}

function SectionIntro({ eyebrow, title, text }: { eyebrow: string; title: React.ReactNode; text: string }) {
  return <div className="abk-section-intro"><div><p className="abk-kicker">{eyebrow}</p><h2>{title}</h2></div><p>{text}</p></div>;
}

function Field({ label, value, onChange, required, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; inputMode?: "tel" }) {
  return <label className="abk-field">{label}{required && <sup>*</sup>}<input value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} inputMode={inputMode} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[] }) {
  return <label className="abk-field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Chọn {label.toLowerCase()}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}
