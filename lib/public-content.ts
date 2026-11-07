/**
 * NGUỒN DỮ LIỆU DUY NHẤT cho nội dung công khai của angelbk.vn
 * (trang chủ, trang /lop-hoc/[slug], FAQ, JSON-LD).
 *
 * QUY TẮC: không bịa số liệu. Mọi thông tin chưa được chủ web xác nhận để là
 * `TODO_OWNER`. Các component và JSON-LD dùng `isKnown()` để TỰ ẨN mọi giá trị
 * còn là TODO_OWNER, nên lỡ merge thì chữ "TODO" cũng không lộ ra web.
 *
 * Khi có dữ liệu thật: chỉ cần thay `TODO_OWNER` bằng giá trị thật ở file này.
 *
 * File này không import gì để test (node --experimental-strip-types) đọc được.
 */

export const TODO_OWNER = "TODO_OWNER" as const;
export type Owned<T> = T | typeof TODO_OWNER;

export const SITE_URL = "https://angelbk.vn";
export const PHONE_DISPLAY = "0933 309 336";
export const PHONE_E164 = "+84933309336";
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** true khi giá trị đã có thật (không phải TODO_OWNER, không rỗng). */
export function isKnown<T>(value: Owned<T> | null | undefined): value is T {
  if (value === null || value === undefined || value === TODO_OWNER) return false;
  if (typeof value === "string") return value.trim() !== "" && !value.includes(TODO_OWNER);
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// ---------------------------------------------------------------------------
// Chương trình học
// ---------------------------------------------------------------------------

export type Program = {
  slug: string;
  /** Tên hiển thị (giữ nguyên như trên web). */
  title: string;
  label: string;
  /** Mô tả ngắn đang có trên trang chủ — đã là nội dung thật. */
  description: string;
  image: string;
  crop: string;
  /** VD: "5–8 tuổi" — dùng cho hiển thị. */
  ageRange: Owned<string>;
  /** Tuổi nhỏ nhất/lớn nhất dạng số — dùng cho JSON-LD typicalAgeRange. */
  minAge: Owned<number>;
  maxAge: Owned<number>;
  /** VD: "Thứ 3, Thứ 5 · 18:00–19:30" */
  schedule: Owned<string>;
  /** VD: "90 phút/buổi" */
  duration: Owned<string>;
  /** VD: "Tối đa 15 bé/lớp" */
  classSize: Owned<string>;
  /** Học phí dạng số (VND) — dùng cho JSON-LD Offer. */
  tuitionVnd: Owned<number>;
  /** Đơn vị/ghi chú học phí, VD: "/tháng (8 buổi)" */
  tuitionUnit: Owned<string>;
  /** Mô tả dài cho trang riêng của chương trình (2–4 đoạn). */
  longDescription: Owned<string[]>;
  /** Những gì bé học được — mỗi dòng một ý. */
  highlights: Owned<string[]>;
  /** Cơ sở có mở lớp này (id trong `branches`). */
  branchIds: Owned<string[]>;
};

export const programs: readonly Program[] = [
  {
    slug: "kids-co-ban",
    title: "Kids cơ bản",
    label: "Nền tảng đầu tiên",
    description: "Làm quen nhịp điệu, kiểm soát cơ thể và xây dựng sự tự tin từ những chuyển động đầu tiên.",
    image: "/images/angelbk/programs/kids-dance-energy.webp",
    crop: "center 30%",
    // Chủ web xác nhận 07/11/2026.
    ageRange: "4–7 tuổi",
    minAge: 4,
    maxAge: 7,
    schedule: "Từ 17h30",
    duration: "60 phút/buổi",
    classSize: "15 bé/lớp",
    tuitionVnd: 600000,
    tuitionUnit: "/tháng",
    longDescription: TODO_OWNER,
    highlights: TODO_OWNER,
    branchIds: ["co-so-1", "co-so-2"],
  },
  {
    slug: "kids-nang-cao",
    title: "Kids nâng cao",
    label: "Nâng cấp kỹ năng",
    description: "Phát triển kỹ thuật, cá tính biểu diễn và khả năng làm việc cùng đội nhóm.",
    image: "/images/angelbk/programs/street-crew.webp",
    crop: "center 40%",
    ageRange: TODO_OWNER,
    minAge: TODO_OWNER,
    maxAge: TODO_OWNER,
    schedule: TODO_OWNER,
    duration: TODO_OWNER,
    classSize: TODO_OWNER,
    tuitionVnd: TODO_OWNER,
    tuitionUnit: TODO_OWNER,
    longDescription: TODO_OWNER,
    highlights: TODO_OWNER,
    branchIds: TODO_OWNER,
  },
  {
    slug: "crew-bieu-dien",
    title: "Crew & biểu diễn",
    label: "Cùng nhau tỏa sáng",
    description: "Rèn luyện trong đội hình, chinh phục sân khấu và lưu lại những trải nghiệm đáng nhớ.",
    image: "/images/angelbk/programs/studio-community.webp",
    crop: "center 44%",
    ageRange: TODO_OWNER,
    minAge: TODO_OWNER,
    maxAge: TODO_OWNER,
    schedule: TODO_OWNER,
    duration: TODO_OWNER,
    classSize: TODO_OWNER,
    tuitionVnd: TODO_OWNER,
    tuitionUnit: TODO_OWNER,
    longDescription: TODO_OWNER,
    highlights: TODO_OWNER,
    branchIds: TODO_OWNER,
  },
  {
    slug: "lop-cuoi-tuan",
    title: "Lớp cuối tuần",
    label: "Nhịp vui cuối tuần",
    description: "Một khoảng thời gian giàu năng lượng để con vận động, kết nối và thể hiện chính mình.",
    image: "/images/angelbk/programs/stage-solo.webp",
    crop: "center 34%",
    ageRange: TODO_OWNER,
    minAge: TODO_OWNER,
    maxAge: TODO_OWNER,
    schedule: TODO_OWNER,
    duration: TODO_OWNER,
    classSize: TODO_OWNER,
    tuitionVnd: TODO_OWNER,
    tuitionUnit: TODO_OWNER,
    longDescription: TODO_OWNER,
    highlights: TODO_OWNER,
    branchIds: TODO_OWNER,
  },
];

export function getProgram(slug: string): Program | undefined {
  return programs.find((program) => program.slug === slug);
}

export function programPath(program: Pick<Program, "slug">): string {
  return `/lop-hoc/${program.slug}`;
}

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

/** "600.000đ/tháng" — null nếu chưa có học phí thật. */
export function tuitionText(program: Program): string | null {
  if (!isKnown(program.tuitionVnd)) return null;
  const unit = isKnown(program.tuitionUnit) ? program.tuitionUnit.trim() : "";
  return `${formatVnd(program.tuitionVnd)}${unit && !unit.startsWith("/") ? " " : ""}${unit}`;
}

/** Các dòng thông tin nhanh của chương trình — CHỈ những ô đã có thật. */
export function programFacts(program: Program): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  if (isKnown(program.ageRange)) facts.push({ label: "Độ tuổi", value: program.ageRange });
  if (isKnown(program.schedule)) facts.push({ label: "Lịch học", value: program.schedule });
  if (isKnown(program.duration)) facts.push({ label: "Thời lượng", value: program.duration });
  if (isKnown(program.classSize)) facts.push({ label: "Sĩ số", value: program.classSize });
  const tuition = tuitionText(program);
  if (tuition) facts.push({ label: "Học phí", value: tuition });
  return facts;
}

// ---------------------------------------------------------------------------
// Giáo viên
// ---------------------------------------------------------------------------

export type Teacher = {
  name: string;
  image: string;
  crop: string;
  /** Giới thiệu ngắn 1–3 câu (kinh nghiệm, phong cách) — chỉ điều có thật. */
  bio: Owned<string>;
};

export const teachers: readonly Teacher[] = [
  { name: "Cô Nhung", image: "/images/angelbk/teachers/co-nhung.webp", crop: "center 22%", bio: TODO_OWNER },
  { name: "Cô Nga", image: "/images/angelbk/teachers/co-nga.webp", crop: "center 18%", bio: TODO_OWNER },
  { name: "Cô Thủy", image: "/images/angelbk/teachers/co-thuy.webp", crop: "center 16%", bio: TODO_OWNER },
  { name: "Thầy Huy", image: "/images/angelbk/teachers/thay-huy.webp", crop: "center 18%", bio: TODO_OWNER },
];

// ---------------------------------------------------------------------------
// Cơ sở
// ---------------------------------------------------------------------------

export type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export type OpeningHours = {
  days: DayOfWeek[];
  /** "HH:MM" 24h */
  opens: string;
  closes: string;
};

export type Branch = {
  id: string;
  name: string;
  /** Tên đầy đủ dùng trong JSON-LD. */
  schemaName: string;
  street: string;
  /** Mô tả đang có trên trang chủ. */
  detail: string;
  /** Phường mới (sau sắp xếp đơn vị hành chính 2025), VD: "Phường Bình Tân". */
  ward: Owned<string>;
  openingHours: Owned<OpeningHours[]>;
};

export const CITY = "TP. Hồ Chí Minh";
export const CITY_SHORT = "TP.HCM";

export const branches: readonly Branch[] = [
  {
    id: "co-so-1",
    name: "Cơ sở 1",
    schemaName: "ANGEL BK – Cơ sở 1 (Tỉnh Lộ 10)",
    street: "1033 Tỉnh Lộ 10",
    detail: "9 lớp đang hoạt động",
    ward: TODO_OWNER,
    openingHours: TODO_OWNER,
  },
  {
    id: "co-so-2",
    name: "Cơ sở 2",
    schemaName: "ANGEL BK – Cơ sở 2 (Tân Hòa Đông)",
    street: "299A Tân Hòa Đông",
    detail: "13 lớp đang hoạt động",
    ward: TODO_OWNER,
    openingHours: TODO_OWNER,
  },
];

/** "1033 Tỉnh Lộ 10, Phường X, TP.HCM" — bỏ phường nếu chưa có. */
export function branchAddress(branch: Branch): string {
  return [branch.street, isKnown(branch.ward) ? branch.ward : null, CITY_SHORT].filter(Boolean).join(", ");
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  Monday: "Thứ 2",
  Tuesday: "Thứ 3",
  Wednesday: "Thứ 4",
  Thursday: "Thứ 5",
  Friday: "Thứ 6",
  Saturday: "Thứ 7",
  Sunday: "Chủ nhật",
};

/** Các dòng giờ mở cửa để hiển thị; rỗng nếu chưa có dữ liệu thật. */
export function openingHoursLines(branch: Branch): string[] {
  if (!isKnown(branch.openingHours)) return [];
  return branch.openingHours
    .filter((slot) => slot.days.length > 0 && slot.opens && slot.closes)
    .map((slot) => `${slot.days.map((day) => DAY_LABELS[day]).join(", ")}: ${slot.opens}–${slot.closes}`);
}

export function branchSchemaId(branch: Branch): string {
  return `${SITE_URL}/#${branch.id}`;
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export type Faq = { question: string; answer: Owned<string> };

const CALL_FOR_OTHERS = `Thông tin các lớp khác, phụ huynh vui lòng gọi ${PHONE_DISPLAY} để được tư vấn.`;

/** "Lớp A dành cho bé 4–7 tuổi; lớp B …" — chỉ lớp đã có độ tuổi thật. */
export function ageFaqAnswer(list: readonly Program[] = programs): Owned<string> {
  const known = list.filter((program) => isKnown(program.ageRange));
  if (!known.length) return TODO_OWNER;
  const parts = known.map((program) => `lớp ${program.title} dành cho bé ${program.ageRange}`);
  const text = `Tại ANGEL BK, ${parts.join("; ")}.`;
  return known.length < list.length ? `${text} ${CALL_FOR_OTHERS}` : text;
}

/** "Học phí lớp A là 600.000đ /tháng; …" — chỉ lớp đã có học phí thật. */
export function tuitionFaqAnswer(list: readonly Program[] = programs): Owned<string> {
  const known = list.filter((program) => isKnown(program.tuitionVnd));
  if (!known.length) return TODO_OWNER;
  const parts = known.map((program) => `lớp ${program.title} là ${tuitionText(program)}`);
  const text = `Học phí ${parts.join("; ")}.`;
  return known.length < list.length ? `${text} ${CALL_FOR_OTHERS}` : text;
}

export const faqs: readonly Faq[] = [
  // Câu trả lời lấy nguyên từ thông tin đã công bố trên web.
  {
    question: "ANGEL BK có mấy cơ sở, ở đâu?",
    answer: "ANGEL BK có 2 cơ sở tại khu vực Bình Tân – Quận 6, TP.HCM: Cơ sở 1 ở 1033 Tỉnh Lộ 10 và Cơ sở 2 ở 299A Tân Hòa Đông.",
  },
  {
    question: "Đăng ký cho bé học thử bằng cách nào?",
    answer: `Phụ huynh điền thông tin ở mục "Đăng ký học thử" trên trang này hoặc gọi ${PHONE_DISPLAY}. ANGEL BK sẽ liên hệ và tư vấn lớp phù hợp cho bé.`,
  },
  {
    question: "Xem lại video biểu diễn của bé ở đâu?",
    answer: "Phụ huynh xem lại các màn trình diễn của bé tại kho video riêng của ANGEL BK: video.angelbk.vn.",
  },
  // Câu phụ huynh hay hỏi — CẦN CHỦ WEB TRẢ LỜI. Còn TODO_OWNER thì tự ẩn.
  // Hai câu dưới tự soạn từ dữ liệu lớp ở trên (chỉ các lớp đã có số thật).
  { question: "Bé mấy tuổi thì học được?", answer: ageFaqAnswer() },
  { question: "Học thử diễn ra như thế nào? Có mất phí không?", answer: TODO_OWNER },
  { question: "Bé nên mặc gì khi đi học nhảy?", answer: TODO_OWNER },
  { question: "Phụ huynh có được xem bé học không?", answer: TODO_OWNER },
  { question: "Bé nhút nhát có theo được lớp không?", answer: TODO_OWNER },
  { question: "Bé có được tham gia biểu diễn không?", answer: TODO_OWNER },
  { question: "Học phí lớp nhảy bao nhiêu?", answer: tuitionFaqAnswer() },
];

/** Chỉ các câu đã có câu trả lời thật. */
export function answeredFaqs(list: readonly Faq[] = faqs): { question: string; answer: string }[] {
  return list.flatMap((faq) => (isKnown(faq.answer) ? [{ question: faq.question, answer: faq.answer }] : []));
}

// ---------------------------------------------------------------------------
// JSON-LD builders (chỉ đưa vào trường đã có thật)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

export function faqPageJsonLd(list: readonly Faq[] = faqs): Json | null {
  const answered = answeredFaqs(list);
  if (!answered.length) return null;
  return {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: answered.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function branchJsonLd(branch: Branch, sameAs: readonly string[]): Json {
  const address: Json = {
    "@type": "PostalAddress",
    streetAddress: branch.street,
    addressLocality: isKnown(branch.ward) ? branch.ward : CITY,
    ...(isKnown(branch.ward) ? { addressRegion: CITY } : {}),
    addressCountry: "VN",
  };
  const node: Json = {
    "@type": "DanceSchool",
    "@id": branchSchemaId(branch),
    name: branch.schemaName,
    url: SITE_URL,
    telephone: PHONE_E164,
    image: `${SITE_URL}/images/angelbk/hero/angel-bk-dance-crew.webp`,
    address,
    areaServed: ["Bình Tân", "Quận 6", CITY],
    parentOrganization: { "@id": ORGANIZATION_ID },
    sameAs: [...sameAs],
  };
  if (isKnown(branch.openingHours)) {
    const slots = branch.openingHours.filter((slot) => slot.days.length > 0 && slot.opens && slot.closes);
    if (slots.length) {
      node.openingHoursSpecification = slots.map((slot) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: slot.days.map((day) => `https://schema.org/${day}`),
        opens: slot.opens,
        closes: slot.closes,
      }));
    }
  }
  return node;
}

export function programTitleTag(program: Pick<Program, "title">): string {
  return `Lớp ${program.title} cho bé tại Bình Tân – Quận 6 | ANGEL BK`;
}

export function programMetaDescription(program: Program): string {
  const age = isKnown(program.ageRange) ? ` Độ tuổi: ${program.ageRange}.` : "";
  return `Lớp ${program.title} – CLB nhảy hiphop ANGEL BK cho bé tại Bình Tân, Quận 6 TP.HCM. ${program.description}${age} Đăng ký học thử: ${PHONE_DISPLAY}.`;
}

export function courseJsonLd(program: Program): Json {
  const url = `${SITE_URL}${programPath(program)}`;
  const course: Json = {
    "@type": "Course",
    "@id": `${url}#course`,
    name: `Lớp ${program.title}`,
    description: program.description,
    url,
    image: `${SITE_URL}${program.image}`,
    inLanguage: "vi-VN",
    provider: { "@id": ORGANIZATION_ID },
  };
  if (isKnown(program.minAge) && isKnown(program.maxAge)) course.typicalAgeRange = `${program.minAge}-${program.maxAge}`;
  else if (isKnown(program.minAge)) course.typicalAgeRange = `${program.minAge}-`;
  if (isKnown(program.tuitionVnd)) {
    course.offers = {
      "@type": "Offer",
      category: "Paid",
      price: program.tuitionVnd,
      priceCurrency: "VND",
      url,
      description: `Học phí ${tuitionText(program)}`,
    };
  }
  if (isKnown(program.branchIds)) {
    const locations = branches.filter((branch) => program.branchIds !== TODO_OWNER && program.branchIds.includes(branch.id));
    if (locations.length) {
      course.hasCourseInstance = locations.map((branch) => ({
        "@type": "CourseInstance",
        courseMode: "Onsite",
        location: { "@id": branchSchemaId(branch) },
        ...(isKnown(program.schedule) ? { courseSchedule: { "@type": "Schedule", description: program.schedule } } : {}),
      }));
    }
  }
  return course;
}

export function programBreadcrumbJsonLd(program: Program): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Trang chủ", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Lớp học", item: `${SITE_URL}/lop-hoc` },
      { "@type": "ListItem", position: 3, name: `Lớp ${program.title}`, item: `${SITE_URL}${programPath(program)}` },
    ],
  };
}

/** Serialize JSON-LD an toàn cho <script>. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
