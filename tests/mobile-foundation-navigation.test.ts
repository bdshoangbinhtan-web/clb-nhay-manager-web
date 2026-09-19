import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const teacherClasses = readFileSync("app/teacher-classes/page.tsx", "utf8");
const mobileNavigation = readFileSync("components/layout/mobile-bottom-nav.tsx", "utf8");
const sidebar = readFileSync("components/layout/sidebar.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");

test("teacher class cards use bounded columns and safely wrapped titles", () => {
  assert.match(teacherClasses, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(teacherClasses, /w-full max-w-full min-w-0/);
  assert.match(teacherClasses, /line-clamp-2 break-words/);
  assert.match(teacherClasses, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(teacherClasses, /<h2 className="truncate/);
});

test("teacher daily view and complete assigned-class entry remain distinct", () => {
  assert.match(teacherClasses, /"Lớp của tôi hôm nay"/);
  assert.match(teacherClasses, /searchParams\.get\("view"\) === "all"/);
  assert.doesNotMatch(teacherClasses, /setShowAll/);
  assert.match(mobileNavigation, /\["Tất cả lớp", "Xem tất cả lớp được phân công"/);
  assert.doesNotMatch(mobileNavigation, /Lịch của tôi/);
});

test("manager navigation omits trial registration but retains trial management", () => {
  for (const source of [mobileNavigation, sidebar]) {
    assert.doesNotMatch(source, /Đăng ký học thử/);
  }
  assert.match(mobileNavigation, /\["Học thử", "Quản lý học viên học thử"/);
  assert.match(sidebar, /"Quản lý học thử"/);
  assert.doesNotMatch(sidebar, /trial_class_leads/);
});

test("the mobile bottom navigation has an explicit desktop cutoff", () => {
  assert.match(globals, /@media \(min-width:1024px\)[\s\S]*?\.abk-bottom-nav \{ display:none; \}/);
});
