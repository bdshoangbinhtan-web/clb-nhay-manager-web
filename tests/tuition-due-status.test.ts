import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTuitionAdjustments,
  determineActiveClasses,
  getFirstUnpaidMonth,
  getMembershipTuitionStatus,
  type TuitionMembership,
  type TuitionRecord,
} from "../lib/tuition/due-status.ts";

const membership: TuitionMembership = {
  student_id: "student-1",
  class_id: "class-1",
  status: "active",
  start_date: "2026-06-14",
  end_date: null,
};

function record(month: string, amountPaid: number, amountDue = 600000): TuitionRecord {
  return {
    id: month,
    student_id: membership.student_id,
    class_id: membership.class_id,
    billing_month: `${month}-01`,
    amount_due: amountDue,
    amount_paid: amountPaid,
  };
}

test("one active class is auto-selected; multiple classes require a choice", () => {
  const classes = [{ id: "class-1" }, { id: "class-2" }];
  const memberships = [
    { ...membership },
    { ...membership, class_id: "class-2" },
  ];
  assert.deepEqual(determineActiveClasses("student-1", classes.slice(0, 1), memberships), {
    classes: [classes[0]],
    autoSelectedClassId: "class-1",
  });
  assert.equal(determineActiveClasses("student-1", classes, memberships).autoSelectedClassId, "");
  assert.equal(determineActiveClasses("missing", classes, memberships).classes.length, 0);
});

test("missing earlier period is returned even when a later period is paid", () => {
  const history = [record("2026-10", 600000), record("2026-11", 600000), record("2027-01", 600000)];
  assert.equal(getFirstUnpaidMonth(membership, history, "2027-01"), "2026-12");
});

test("due, overdue, partial, paid current, and paid ahead are distinguished", () => {
  assert.equal(getMembershipTuitionStatus(membership, "active", "active", [], "2026-10").status, "DUE");
  const twoMonthsBehind = [record("2026-10", 600000)];
  assert.equal(getMembershipTuitionStatus(membership, "active", "active", twoMonthsBehind, "2026-12").status, "OVERDUE");
  const partial = getMembershipTuitionStatus(membership, "active", "active", [record("2026-10", 100000)], "2026-10");
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.remaining, 500000);
  assert.equal(getMembershipTuitionStatus(membership, "active", "active", [record("2026-10", 600000)], "2026-10").status, "PAID_CURRENT");
  const paidAhead = getMembershipTuitionStatus(membership, "active", "active", [record("2026-10", 600000), record("2026-11", 600000)], "2026-10");
  assert.equal(paidAhead.status, "PAID_AHEAD");
  assert.equal(paidAhead.firstUnpaidMonth, "2026-12");
  assert.equal(paidAhead.paidThroughMonth, "2026-11");
  const partialFuture = getMembershipTuitionStatus(membership, "active", "active", [record("2026-10", 600000), record("2026-11", 200000)], "2026-10");
  assert.equal(partialFuture.status, "PAID_CURRENT", "future partial payment is not current debt");
  assert.equal(partialFuture.firstUnpaidMonth, "2026-11");
  assert.equal(partialFuture.remaining, 400000);
});

test("pre-launch periods do not create automatic debt; October starts tracking at October", () => {
  const septemberHistory = [record("2026-09", 600000)];
  const preLaunch = getMembershipTuitionStatus(membership, "active", "active", septemberHistory, "2026-09");
  assert.equal(preLaunch.status, "PRE_LAUNCH");
  assert.equal(preLaunch.firstUnpaidMonth, "2026-10");
  assert.equal(preLaunch.remaining, 0);
  assert.equal(septemberHistory[0].amount_paid, 600000, "historical payment remains available unchanged");
  assert.equal(getFirstUnpaidMonth(membership, septemberHistory, "2026-09"), "2026-10");

  const october = getMembershipTuitionStatus(membership, "active", "active", septemberHistory, "2026-10");
  assert.equal(october.status, "DUE");
  assert.equal(october.firstUnpaidMonth, "2026-10");

  const november = getMembershipTuitionStatus(membership, "active", "active", septemberHistory, "2026-11");
  assert.equal(november.status, "OVERDUE");
  assert.equal(november.firstUnpaidMonth, "2026-10");
});

test("advance payments move the collectible period forward without September debt", () => {
  const october = [record("2026-10", 600000)];
  const afterOctober = getMembershipTuitionStatus(membership, "active", "active", october, "2026-09");
  assert.equal(afterOctober.status, "PRE_LAUNCH");
  assert.equal(afterOctober.paidThroughMonth, "2026-10");
  assert.equal(afterOctober.firstUnpaidMonth, "2026-11");
  assert.equal(getFirstUnpaidMonth(membership, october, "2026-09"), "2026-11");

  const afterNovember = getMembershipTuitionStatus(
    membership, "active", "active", [...october, record("2026-11", 600000)], "2026-09"
  );
  assert.equal(afterNovember.status, "PRE_LAUNCH");
  assert.equal(afterNovember.paidThroughMonth, "2026-11");
  assert.equal(afterNovember.firstUnpaidMonth, "2026-12");

  const partialDecember = getMembershipTuitionStatus(
    membership, "active", "active",
    [...october, record("2026-11", 600000), record("2026-12", 200000)], "2026-09"
  );
  assert.equal(partialDecember.firstUnpaidMonth, "2026-12");
  assert.equal(partialDecember.amountDue, 600000);
  assert.equal(partialDecember.amountPaid, 200000);
  assert.equal(partialDecember.remaining, 400000);

  const gap = getMembershipTuitionStatus(
    membership, "active", "active", [record("2026-10", 600000), record("2026-12", 600000)], "2026-09"
  );
  assert.equal(gap.firstUnpaidMonth, "2026-11");
  assert.equal(gap.paidThroughMonth, "2026-10");
});

test("ended and inactive memberships are excluded and start month is respected", () => {
  assert.equal(getMembershipTuitionStatus({ ...membership, end_date: "2026-09-30" }, "active", "active", [], "2026-10").status, "INACTIVE");
  assert.equal(getMembershipTuitionStatus({ ...membership, status: "inactive" }, "active", "active", [], "2026-10").status, "INACTIVE");
  const lateEnrollment = { ...membership, start_date: "2026-12-24" };
  assert.equal(getFirstUnpaidMonth(lateEnrollment, [], "2027-01"), "2026-12");
  assert.equal(getMembershipTuitionStatus(lateEnrollment, "active", "active", [], "2026-12").status, "DUE");
});

test("missing start date anchors obligations at the earliest known period, never earlier", () => {
  const unknownStart = { ...membership, start_date: null };
  assert.equal(getFirstUnpaidMonth(unknownStart, [record("2026-11", 600000)], "2026-12"), "2026-12");
});

test("historical tuition from a former class does not count toward the new class", () => {
  const currentMembership = { ...membership, class_id: "class-2", start_date: "2026-11-10" };
  const oldClassPayment = [record("2026-10", 600000)];
  assert.equal(getFirstUnpaidMonth(currentMembership, oldClassPayment, "2026-11"), "2026-11");
});

test("effective due applies canceled amounts, payment ledger totals, and carry-forward credits", () => {
  const rows = [record("2026-06", 0), { ...record("2026-07", 0), id: "next-period" }];
  const effective = applyTuitionAdjustments(
    rows,
    [{ tuition_id: rows[0].id, amount: 100000 }],
    [
      { tuition_id: rows[0].id, target_tuition_id: null, action: "cancel", amount: 500000 },
      { tuition_id: rows[0].id, target_tuition_id: rows[1].id, action: "carry_forward", amount: 200000 },
    ]
  );
  assert.equal(effective[0].effective_amount_due, 100000);
  assert.equal(effective[0].effective_amount_paid, 100000);
  assert.equal(effective[1].effective_amount_paid, 200000);
});
