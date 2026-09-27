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
  const history = [record("2026-06", 600000), record("2026-07", 600000), record("2026-09", 600000)];
  assert.equal(getFirstUnpaidMonth(membership, history, "2026-09"), "2026-08");
});

test("due, overdue, partial, paid current, and paid ahead are distinguished", () => {
  assert.equal(getMembershipTuitionStatus(membership, "active", "active", [], "2026-06").status, "DUE");
  const twoMonthsBehind = [record("2026-06", 600000)];
  assert.equal(getMembershipTuitionStatus(membership, "active", "active", twoMonthsBehind, "2026-08").status, "OVERDUE");
  const partial = getMembershipTuitionStatus(membership, "active", "active", [record("2026-06", 100000)], "2026-06");
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.remaining, 500000);
  assert.equal(getMembershipTuitionStatus(membership, "active", "active", [record("2026-06", 600000)], "2026-06").status, "PAID_CURRENT");
  assert.equal(getMembershipTuitionStatus(membership, "active", "active", [record("2026-06", 600000), record("2026-07", 600000)], "2026-06").status, "PAID_AHEAD");
});

test("ended and inactive memberships are excluded and start month is respected", () => {
  assert.equal(getMembershipTuitionStatus({ ...membership, end_date: "2026-05-31" }, "active", "active", [], "2026-06").status, "INACTIVE");
  assert.equal(getMembershipTuitionStatus({ ...membership, status: "inactive" }, "active", "active", [], "2026-06").status, "INACTIVE");
  assert.equal(getFirstUnpaidMonth({ ...membership, start_date: "2026-08-24" }, [], "2026-09"), "2026-08");
});

test("missing start date anchors obligations at the earliest known period, never earlier", () => {
  const unknownStart = { ...membership, start_date: null };
  assert.equal(getFirstUnpaidMonth(unknownStart, [record("2026-08", 600000)], "2026-09"), "2026-09");
});

test("historical tuition from a former class does not count toward the new class", () => {
  const currentMembership = { ...membership, class_id: "class-2", start_date: "2026-09-10" };
  const oldClassPayment = [record("2026-09", 600000)];
  assert.equal(getFirstUnpaidMonth(currentMembership, oldClassPayment, "2026-09"), "2026-09");
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
