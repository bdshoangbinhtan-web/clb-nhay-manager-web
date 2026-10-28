import assert from "node:assert/strict";
import test from "node:test";

import {
  isVoidedDuplicateTuition,
  sumAdvanceTuitionCollected,
  sumTuitionByBillingPeriod,
} from "../lib/finance/tuition-period.ts";

function payment(amount: number, payment_date: string, billing_month: string, branch_id = "cs1", note: string | null = null) {
  return { amount, payment_date, tuition: { billing_month, branch_id, note } };
}

test("thu trước tháng 11 vào tháng 10: tháng 10 tăng tiền thu nhưng không tăng doanh thu học phí kỳ 10", () => {
  const receipts = [
    payment(600000, "2026-10-28", "2026-11-01"),
    payment(500000, "2026-10-20", "2026-10-01"),
  ];
  assert.equal(receipts.filter((item) => item.payment_date.startsWith("2026-10")).reduce((a, b) => a + b.amount, 0), 1100000);
  assert.equal(sumAdvanceTuitionCollected(receipts, "2026-10"), 600000);
  assert.equal(sumTuitionByBillingPeriod(receipts, "2026-10"), 500000);
  assert.equal(sumTuitionByBillingPeriod(receipts, "2026-11"), 600000);
});

test("thu bù tháng 10 vào tháng 11 vẫn được quy về doanh thu học phí kỳ 10", () => {
  const receipts = [payment(300000, "2026-11-03", "2026-10-01")];
  assert.equal(sumTuitionByBillingPeriod(receipts, "2026-10"), 300000);
  assert.equal(sumAdvanceTuitionCollected(receipts, "2026-11"), 0);
});

test("không tính phiếu chuyển lớp trùng đã bị vô hiệu", () => {
  const receipts = [
    payment(300000, "2026-10-10", "2026-10-01", "cs1", "[VOID_DUPLICATE_TRANSFER]"),
    payment(450000, "2026-10-10", "2026-10-01"),
  ];
  assert.equal(isVoidedDuplicateTuition(receipts[0]), true);
  assert.equal(sumTuitionByBillingPeriod(receipts, "2026-10"), 450000);
});

test("lọc đúng cơ sở, tính kỳ năm và không xem thu trước trong cùng năm là thu trước năm sau", () => {
  const receipts = [
    payment(350000, "2026-12-01", "2027-01-01", "cs1"),
    payment(200000, "2026-12-01", "2026-12-01", "cs2"),
    payment(300000, "2026-10-25", "2026-11-01", "cs1"),
  ];
  assert.equal(sumAdvanceTuitionCollected(receipts, "2026", "cs1"), 350000);
  assert.equal(sumAdvanceTuitionCollected(receipts, "2026-10", "cs1"), 300000);
  assert.equal(sumTuitionByBillingPeriod(receipts, "2026", "cs2"), 200000);
});

test("khoản hoàn tiền được phân bổ về đúng tháng học, không căn cứ ngày hoàn", () => {
  const refunds = [{ amount: 200000, tuition: { billing_month: "2026-10-01", branch_id: "cs1", note: null } }];
  assert.equal(sumTuitionByBillingPeriod(refunds, "2026-10"), 200000);
  assert.equal(sumTuitionByBillingPeriod(refunds, "2026-11"), 0);
});

test("các khoản thiếu kỳ học không bị tự gán tháng thu tiền", () => {
  const receipts = [{ amount: 100000, payment_date: "2026-10-23", tuition: null }];
  assert.equal(sumTuitionByBillingPeriod(receipts, "2026-10"), 0);
  assert.equal(sumAdvanceTuitionCollected(receipts, "2026-10"), 0);
});
