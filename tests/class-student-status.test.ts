import assert from "node:assert/strict";
import test from "node:test";
import {
  countClassStudentStatuses,
  filterClassStudentsByStatus,
  isStudentStudying,
} from "../lib/class-student-status.ts";

const students = [
  { id: "a", status: "active" },
  { id: "b", status: "inactive" },
  { id: "c", status: "reserved" },
  { id: "d", status: "active" },
];

test("trạng thái đang học chỉ đúng với active; inactive và reserved là tạm ngưng", () => {
  assert.equal(isStudentStudying("active"), true);
  assert.equal(isStudentStudying("inactive"), false);
  assert.equal(isStudentStudying("reserved"), false);
  assert.equal(isStudentStudying(null), false);
});

test("bộ lọc và số lượng luôn dựa trên trạng thái thực tế", () => {
  assert.deepEqual(countClassStudentStatuses(students), { all: 4, active: 2, paused: 2 });
  assert.deepEqual(filterClassStudentsByStatus(students, "all").map((s) => s.id), ["a", "b", "c", "d"]);
  assert.deepEqual(filterClassStudentsByStatus(students, "active").map((s) => s.id), ["a", "d"]);
  assert.deepEqual(filterClassStudentsByStatus(students, "paused").map((s) => s.id), ["b", "c"]);
});

test("trạng thái mới phản ánh ngay trong bộ lọc khi thay đổi danh sách", () => {
  const updated = students.map((s) => s.id === "b" ? { ...s, status: "active" } : s);
  assert.deepEqual(countClassStudentStatuses(updated), { all: 4, active: 3, paused: 1 });
  assert.deepEqual(filterClassStudentsByStatus(updated, "paused").map((s) => s.id), ["c"]);
});
