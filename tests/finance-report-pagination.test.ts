import assert from "node:assert/strict";
import test from "node:test";
import { loadAllPages } from "../lib/finance/report-pagination.ts";

test("báo cáo lấy đủ các trang 500 dòng, không bỏ sót khi vừa tròn một trang", async () => {
  const expected = Array.from({ length: 1234 }, (_, index) => index);
  const result = await loadAllPages(async (from, to) => ({
    data: expected.slice(from, to + 1),
    error: null,
  }));
  assert.equal(result.error, null);
  assert.deepEqual(result.data, expected);
});

test("không hiển thị doanh thu tính thiếu khi một trang truy vấn báo lỗi", async () => {
  const result = await loadAllPages(async (from) => from === 0
    ? { data: [1, 2], error: null }
    : { data: null, error: { message: "network failure" } }, 2);
  assert.equal(result.data, null);
  assert.equal(result.error?.message, "network failure");
});
