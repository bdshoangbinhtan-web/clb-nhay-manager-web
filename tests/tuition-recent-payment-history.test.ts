import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTuitionRecordedTimestamp,
  newestTuitionPayments,
} from "../lib/tuition/recent-payment-history.ts";

const validTuition = {
  id: "tuition-1",
  student_id: "student-1",
  class_id: "class-1",
  billing_month: "2026-12-01",
  note: null,
};
const voidTuition = {
  ...validTuition,
  id: "voided-tuition",
  note: "[VOID_DUPLICATE_TRANSFER]",
};

test("recent tuition history uses recorded time rather than billed month or payment date", () => {
  const payments = [
    {
      id: "older",
      tuition_id: validTuition.id,
      amount: 600000,
      payment_method: "cash",
      payment_date: "2026-11-04",
      created_at: "2026-11-04T08:30:00Z",
      receipt_no: "PT-1",
    },
    {
      id: "newer",
      tuition_id: validTuition.id,
      amount: 600000,
      payment_method: "transfer",
      payment_date: "2026-10-27",
      created_at: "2026-11-04T09:45:33Z",
      receipt_no: "PT-2",
    },
    {
      id: "voided",
      tuition_id: voidTuition.id,
      amount: 300000,
      payment_method: "transfer",
      payment_date: "2026-11-04",
      created_at: "2026-11-04T10:00:00Z",
      receipt_no: "PT-VOID",
    },
    {
      id: "zero",
      tuition_id: validTuition.id,
      amount: 0,
      payment_method: "cash",
      payment_date: "2026-11-04",
      created_at: "2026-11-04T11:00:00Z",
      receipt_no: "PT-ZERO",
    },
  ];

  const history = newestTuitionPayments(payments, [validTuition, voidTuition]);

  assert.deepEqual(history.map(({ payment }) => payment.id), ["newer", "older"]);
  assert.equal(history[0].tuition.billing_month, "2026-12-01");
  assert.equal(history[0].payment.payment_method, "transfer");
  assert.equal(history[0].payment.payment_date, "2026-10-27");
});

test("recording time shows Vietnamese date and seconds in Ho Chi Minh City", () => {
  assert.equal(
    formatTuitionRecordedTimestamp("2026-11-04T14:07:09Z"),
    "04/11/2026 · 21:07:09"
  );
  assert.equal(formatTuitionRecordedTimestamp(null), "Chưa có thời điểm ghi nhận");
  assert.equal(formatTuitionRecordedTimestamp("invalid"), "Chưa có thời điểm ghi nhận");
});
