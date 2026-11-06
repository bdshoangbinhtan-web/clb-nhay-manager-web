import assert from "node:assert/strict";
import test from "node:test";
import { suggestedTuitionAmount, requiresTuitionVarianceExplanation } from "../lib/tuition/fee-proposal.ts";

const cls = {
  monthly_fee: 600000,
  schedule_days: ["3","5","7"],
  schedule_start: "17:30",
  schedule_end: "18:30",
};
const student = (join_date: string | null, tuition_resumed_on: string | null = null) => ({ join_date, tuition_resumed_on });

test("học bình thường đã học từ trước: thu trọn mức tháng", () => {
  assert.equal(suggestedTuitionAmount(student("2026-10-03"),cls,"2026-11"),600000);
});

test("học lại 11/11 chỉ tính số buổi lịch 3-5-7 còn lại, 8 buổi x 50.000", () => {
  assert.equal(suggestedTuitionAmount(student("2026-10-03","2026-11-11"),cls,"2026-11"),400000);
});

test("học lại giữa tháng trước, sang tháng tiếp theo thu trọn tháng", () => {
  assert.equal(suggestedTuitionAmount(student("2026-10-03","2026-11-11"),cls,"2026-12"),600000);
});

test("ngày học lại không làm thay đổi học phí của các tháng trước", () => {
  assert.equal(suggestedTuitionAmount(student("2026-10-03","2026-11-11"),cls,"2026-10"),600000);
});

test("ngày vào học mới cùng tháng và ngày học lại lấy mốc muộn nhất", () => {
  assert.equal(suggestedTuitionAmount(student("2026-11-15","2026-11-11"),cls,"2026-11"),300000);
});

test("buổi 2 giờ có thể áp dụng giới hạn học phí tháng", () => {
  assert.equal(suggestedTuitionAmount(student("2026-10-03","2026-11-11"),
    {...cls,schedule_end:"19:30"},"2026-11"),600000);
});

test("thu khác đề xuất cần ghi chú, thu đúng thì không", () => {
  assert.equal(requiresTuitionVarianceExplanation(300000,400000),true);
  assert.equal(requiresTuitionVarianceExplanation(500000,400000),true);
  assert.equal(requiresTuitionVarianceExplanation(400000,400000),false);
});
