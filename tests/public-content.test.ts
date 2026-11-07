import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  answeredFaqs,
  branchAddress,
  branches,
  branchJsonLd,
  courseJsonLd,
  faqPageJsonLd,
  faqs,
  isKnown,
  openingHoursLines,
  programFacts,
  programMetaDescription,
  programs,
  programTitleTag,
  TODO_OWNER,
  type Branch,
  type Program,
} from "../lib/public-content.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- truy cập sâu vào JSON-LD trong test
type Json = Record<string, any>;

const noTodo = (value: unknown, label: string) =>
  assert.doesNotMatch(JSON.stringify(value), /TODO/i, `${label} lộ chữ TODO`);

test("isKnown hides TODO_OWNER, empty and missing values", () => {
  assert.equal(isKnown(TODO_OWNER), false);
  assert.equal(isKnown(""), false);
  assert.equal(isKnown("  "), false);
  assert.equal(isKnown("xx TODO_OWNER"), false);
  assert.equal(isKnown(undefined), false);
  assert.equal(isKnown([]), false);
  assert.equal(isKnown("6–10 tuổi"), true);
  assert.equal(isKnown(0), true);
  assert.equal(isKnown(["a"]), true);
});

test("nothing rendered or put in JSON-LD contains TODO with the current data", () => {
  for (const program of programs) {
    noTodo(programFacts(program), `facts ${program.slug}`);
    noTodo(courseJsonLd(program), `Course ${program.slug}`);
    noTodo(programTitleTag(program), `title ${program.slug}`);
    noTodo(programMetaDescription(program), `description ${program.slug}`);
  }
  for (const branch of branches) {
    noTodo(branchAddress(branch), `address ${branch.id}`);
    noTodo(openingHoursLines(branch), `hours ${branch.id}`);
    noTodo(branchJsonLd(branch, []), `DanceSchool ${branch.id}`);
  }
  noTodo(answeredFaqs(), "FAQ");
  noTodo(faqPageJsonLd(), "FAQPage");
});

test("FAQ only contains questions with real answers", () => {
  const answered = answeredFaqs();
  const unanswered = faqs.filter((faq) => faq.answer === TODO_OWNER);
  assert.ok(unanswered.length >= 7, "các câu phụ huynh hay hỏi đã được soạn sẵn");
  assert.equal(answered.length + unanswered.length, faqs.length);
  assert.equal(answeredFaqs([{ question: "Q", answer: TODO_OWNER }]).length, 0);
  assert.equal(faqPageJsonLd([{ question: "Q", answer: TODO_OWNER }]), null);
  const page = faqPageJsonLd([{ question: "Q?", answer: "A." }, { question: "X?", answer: TODO_OWNER }]) as { mainEntity: unknown[] };
  assert.equal(page.mainEntity.length, 1);
});

test("unknown program facts are omitted; known ones appear in page and Course JSON-LD", () => {
  const base = programs[0];
  assert.deepEqual(programFacts(base), []);
  const course = courseJsonLd(base);
  for (const key of ["typicalAgeRange", "offers", "hasCourseInstance"]) assert.equal(key in course, false, key);

  const filled: Program = { ...base, ageRange: "6–10 tuổi", minAge: 6, maxAge: 10, schedule: "Thứ 7 · 8:00–9:30", tuitionVnd: 600000, tuitionUnit: "/tháng", branchIds: ["co-so-1"] };
  const labels = programFacts(filled).map((fact) => fact.label);
  assert.deepEqual(labels, ["Độ tuổi", "Lịch học", "Học phí"]);
  const filledCourse = courseJsonLd(filled) as Json;
  assert.equal(filledCourse.typicalAgeRange, "6-10");
  assert.equal(filledCourse.offers.price, 600000);
  assert.equal(filledCourse.offers.priceCurrency, "VND");
  assert.equal(filledCourse.hasCourseInstance.length, 1);
  assert.equal(filledCourse.hasCourseInstance[0].location["@id"], "https://angelbk.vn/#co-so-1");
});

test("ward and opening hours flow into DanceSchool JSON-LD once known", () => {
  const base = branches[0];
  const unknown = branchJsonLd(base, []) as Json;
  assert.equal("openingHoursSpecification" in unknown, false);
  assert.equal(unknown.address.addressLocality, "TP. Hồ Chí Minh");

  const filled: Branch = { ...base, ward: "Phường Ví Dụ", openingHours: [{ days: ["Saturday", "Sunday"], opens: "08:00", closes: "17:00" }] };
  const node = branchJsonLd(filled, []) as Json;
  assert.equal(node.address.streetAddress, "1033 Tỉnh Lộ 10");
  assert.equal(node.address.addressLocality, "Phường Ví Dụ");
  assert.equal(node.address.addressRegion, "TP. Hồ Chí Minh");
  assert.deepEqual(node.openingHoursSpecification, [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["https://schema.org/Saturday", "https://schema.org/Sunday"], opens: "08:00", closes: "17:00" }]);
  assert.equal(branchAddress(filled), "1033 Tỉnh Lộ 10, Phường Ví Dụ, TP.HCM");
  assert.deepEqual(openingHoursLines(filled), ["Thứ 7, Chủ nhật: 08:00–17:00"]);
});

test("program H1/title follows the agreed pattern and slugs match sitemap-friendly format", () => {
  assert.equal(programTitleTag(programs[0]), "Lớp Kids cơ bản cho bé tại Bình Tân – Quận 6 | ANGEL BK");
  for (const program of programs) assert.match(program.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const sitemap = readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(sitemap, /programs\.map/);
});

test("public components only read TODO-able fields through isKnown/helpers", () => {
  for (const file of ["../components/public/public-home.tsx", "../app/lop-hoc/[slug]/page.tsx", "../components/public/public-subpage.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /TODO_OWNER/, file);
    for (const line of source.split("\n")) {
      const raw = line.match(/\{(teacher|branch|program)\.(bio|ward|openingHours|ageRange|schedule|duration|classSize|tuitionVnd|tuitionUnit)\}/);
      if (raw) assert.match(line, new RegExp(`isKnown\\(${raw[1]}\\.${raw[2]}\\)`), `${file}: ${line.trim()}`);
    }
  }
});
