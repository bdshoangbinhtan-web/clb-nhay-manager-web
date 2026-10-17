import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTransferredTuitionCoverage,
  getFirstUnpaidMonth,
  getMembershipTuitionStatus,
  type TuitionMembership,
  type TuitionRecord,
  type TuitionTransferOut,
} from "../lib/tuition/due-status.ts";

const membership: TuitionMembership = {
  student_id: "student-1",
  class_id: "beauty-girls",
  status: "active",
  start_date: "2026-10-17",
  end_date: null,
};
const paid = (id: string, classId: string, month: string, amountPaid = 600000): TuitionRecord => ({
  id, student_id: "student-1", class_id: classId, billing_month: `${month}-01`,
  amount_due: 600000, amount_paid: amountPaid,
});
const out = (classId: string, start: string, end: string, changedAt: string): TuitionTransferOut => ({
  student_id: "student-1", class_id: classId, start_date: start,
  end_date: end, changed_at: changedAt,
});
const first = out("coach-ngoc", "2026-09-20", "2026-10-17", "2026-10-17T14:53:06Z");

test("Phương Vy: paid October survives a real transfer; November remains collectible", () => {
  const original = [paid("original-receipt", "coach-ngoc", "2026-10")];
  const result = applyTransferredTuitionCoverage(original, [membership], [first]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "original-receipt");
  assert.equal(result[0].class_id, "coach-ngoc", "original receipt belongs to the old class");
  assert.equal(result[1].class_id, "beauty-girls");
  assert.equal(result[1].covered_by_transfer, true);
  assert.equal(result[1].effective_amount_paid, 600000);
  assert.equal(getFirstUnpaidMonth(membership, result, "2026-10"), "2026-11");
  assert.equal(getMembershipTuitionStatus(membership, "active", "active", result, "2026-10").paidThroughMonth, "2026-10");
  assert.equal(original.length, 1, "no real tuition row or receipt was created");
});

test("adding an extra class without a transfer never waives tuition", () => {
  const result = applyTransferredTuitionCoverage([paid("p1", "coach-ngoc", "2026-10")], [membership], []);
  assert.equal(result.length, 1);
  assert.equal(getFirstUnpaidMonth(membership, result, "2026-10"), "2026-10");
});

test("partial or September-only payment is not presented as an October transfer credit", () => {
  const partial = applyTransferredTuitionCoverage([paid("p1", "coach-ngoc", "2026-10", 200000)], [membership], [first]);
  const september = applyTransferredTuitionCoverage([paid("p2", "coach-ngoc", "2026-09")], [membership], [first]);
  assert.equal(partial.length, 1);
  assert.equal(september.length, 1);
});

test("same-day A -> B -> A -> B history traces the paid source without looping", () => {
  const events = [
    first,
    out("beauty-girls", "2026-10-17", "2026-10-17", "2026-10-17T15:00:57Z"),
    out("coach-ngoc", "2026-10-17", "2026-10-17", "2026-10-17T15:08:05Z"),
  ];
  const result = applyTransferredTuitionCoverage(
    [paid("p1", "coach-ngoc", "2026-10")],
    [membership],
    events
  );
  assert.equal(result.filter((row) => row.class_id === "beauty-girls").length, 1);
  assert.equal(getFirstUnpaidMonth(membership, result, "2026-10"), "2026-11");
});

test("multi-day A -> B -> C inherits A's payment through the entire transfer chain", () => {
  const events = [
    out("coach-ngoc", "2026-09-10", "2026-10-05", "2026-10-05T12:00:00Z"),
    out("class-b", "2026-10-05", "2026-10-17", "2026-10-17T12:00:00Z"),
  ];
  const current: TuitionMembership = { ...membership, class_id: "class-c" };
  const result = applyTransferredTuitionCoverage(
    [paid("p1", "coach-ngoc", "2026-10")], [current], events
  );
  assert.equal(result.find((row) => row.class_id === "class-c")?.covered_by_transfer, true);
});

test("advance November payment follows October transfer without December credit", () => {
  const rows = [paid("oct", "coach-ngoc", "2026-10"), paid("nov", "coach-ngoc", "2026-11")];
  const result = applyTransferredTuitionCoverage(rows, [membership], [first]);
  assert.equal(getFirstUnpaidMonth(membership, result, "2026-10"), "2026-12");
});

test("an unpaid duplicate invoice is neutralized only in the view, never overwritten in storage", () => {
  const duplicated = paid("target-unpaid", "beauty-girls", "2026-10", 0);
  duplicated.amount_due = 300000;
  const input = [paid("old-paid", "coach-ngoc", "2026-10"), duplicated];
  const result = applyTransferredTuitionCoverage(input, [membership], [first]);
  assert.equal(result.length, 2);
  const target = result.find((row) => row.id === "target-unpaid")!;
  assert.equal(target.amount_paid, 0, "the historical stored amount does not change");
  assert.equal(target.effective_amount_paid, 300000);
  assert.equal(target.covered_by_transfer, true);
  assert.equal(duplicated.effective_amount_paid, undefined, "source state was not mutated");
});

test("a separately paid destination-class fee is never replaced or double-counted", () => {
  const input = [paid("source", "coach-ngoc", "2026-10"), paid("target", "beauty-girls", "2026-10")];
  const result = applyTransferredTuitionCoverage(input, [membership], [first]);
  assert.equal(result.length, 2);
  assert.equal(result.find((row) => row.id === "target")?.covered_by_transfer, undefined);
});

test("a transfer in November cannot carry over an already-consumed October month", () => {
  const novemberMembership = { ...membership, start_date: "2026-11-04" };
  const novemberTransfer = out("coach-ngoc", "2026-09-20", "2026-11-04", "2026-11-04T12:00:00Z");
  const result = applyTransferredTuitionCoverage([paid("old", "coach-ngoc", "2026-10")], [novemberMembership], [novemberTransfer]);
  assert.equal(result.length, 1);
  assert.equal(getFirstUnpaidMonth(novemberMembership, result, "2026-11"), "2026-11");
});
