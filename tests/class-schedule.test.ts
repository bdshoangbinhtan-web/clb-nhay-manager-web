import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizedScheduleDayCount,
  normalizeScheduleDay,
  scheduleIncludesDay,
} from "../lib/class-schedule.ts";

test("lớp một buổi Chủ Nhật nhận cả CN và 0", () => {
  assert.equal(normalizeScheduleDay("CN"), "0");
  assert.equal(normalizeScheduleDay("0"), "0");
  assert.equal(scheduleIncludesDay(["CN"], "0"), true);
  assert.equal(scheduleIncludesDay(["0"], "CN"), true);
  assert.equal(normalizedScheduleDayCount(["CN"]), 1);
});

test("lớp hai buổi vẫn giữ lịch hợp lệ", () => {
  assert.equal(scheduleIncludesDay(["2", "5"], "5"), true);
  assert.equal(normalizedScheduleDayCount(["2", "5"]), 2);
});

test("lớp ba buổi vẫn giữ lịch hợp lệ", () => {
  assert.equal(scheduleIncludesDay(["2", "4", "6"], "4"), true);
  assert.equal(normalizedScheduleDayCount(["2", "4", "6"]), 3);
});

test("CN và 0 không bị đếm thành hai buổi khác nhau", () => {
  assert.equal(normalizedScheduleDayCount(["CN", "0"]), 1);
});

test("giá trị lịch không hợp lệ không khớp ngày dạy", () => {
  assert.equal(normalizeScheduleDay("1"), null);
  assert.equal(scheduleIncludesDay(["1"], "0"), false);
});
