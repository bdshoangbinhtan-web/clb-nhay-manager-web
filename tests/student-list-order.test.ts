import assert from "node:assert/strict";
import test from "node:test";
import { compareStudentsNewestFirst, studentAdmissionDay } from "../lib/student-list-order.ts";

type Entry = {
  id: string;
  full_name: string;
  join_date: string | null;
  created_at: string | null;
  student_code: string;
};

function entry(id: string, full_name: string, join_date: string | null, created_at = "2026-10-01T00:00:00Z"): Entry {
  return { id, full_name, join_date, created_at, student_code: "HV00000" + id };
}

test("ưu tiên ngày vào học mới nhất, không phụ thuộc thứ tự tên", () => {
  const students = [
    entry("1", "An", "2026-10-01"),
    entry("2", "Bình", "2026-10-28"),
    entry("3", "Ánh", "2026-10-27"),
  ];
  assert.deepEqual(students.sort(compareStudentsNewestFirst).map((student) => student.id), ["2", "3", "1"]);
});

test("trùng ngày vào học thì sắp xếp tên A–Z tiếng Việt", () => {
  const students = [
    entry("1", "Đạt", "2026-10-28"),
    entry("2", "An", "2026-10-28"),
    entry("3", "Bình", "2026-10-28"),
  ];
  assert.deepEqual(students.sort(compareStudentsNewestFirst).map((student) => student.id), ["2", "3", "1"]);
});

test("ngày vào học được ưu tiên hơn thời điểm tạo hồ sơ", () => {
  const createdLater = entry("1", "An", "2026-10-01", "2026-10-28T10:00:00Z");
  const enrolledLater = entry("2", "Bình", "2026-10-20", "2026-10-02T10:00:00Z");
  assert.deepEqual([createdLater, enrolledLater].sort(compareStudentsNewestFirst).map((student) => student.id), ["2", "1"]);
});

test("hồ sơ cũ thiếu ngày vào học dùng ngày tạo theo giờ Việt Nam", () => {
  const withoutJoinDate = entry("1", "An", null, "2026-10-27T18:30:00Z");
  assert.equal(studentAdmissionDay(withoutJoinDate), "2026-10-28");
  assert.deepEqual(
    [entry("2", "Bình", "2026-10-27"), withoutJoinDate].sort(compareStudentsNewestFirst).map((student) => student.id),
    ["1", "2"],
  );
});

test("không có cả ngày vào học và ngày tạo thì đứng cuối", () => {
  const withoutDates = { ...entry("1", "An", null), created_at: null };
  assert.deepEqual(
    [withoutDates, entry("2", "Bình", "2026-10-01")].sort(compareStudentsNewestFirst).map((student) => student.id),
    ["2", "1"],
  );
});
