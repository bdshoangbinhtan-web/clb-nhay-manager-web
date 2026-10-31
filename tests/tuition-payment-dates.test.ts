import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTuitionCollectionDate,
  getTuitionCollectionDates,
} from "../lib/tuition/payment-dates.ts";

test("advance November tuition paid on October 27 displays actual collection date", () => {
  const novemberTuition = { amount_paid: 600000, payment_date: "2026-10-27" };
  const dates = getTuitionCollectionDates(novemberTuition, [
    { payment_date: "2026-10-27" },
  ]);
  assert.deepEqual(dates, ["2026-10-27"]);
  assert.equal(formatTuitionCollectionDate(dates[0]), "27/10/2026");
});

test("partial payments on different dates display each unique date latest first", () => {
  const dates = getTuitionCollectionDates(
    { amount_paid: 600000, payment_date: "2026-10-20" },
    [
      { payment_date: "2026-10-12" },
      { payment_date: "2026-10-27" },
      { payment_date: "2026-10-27" },
    ]
  );
  assert.deepEqual(dates, ["2026-10-27", "2026-10-12"]);
});

test("unpaid rows show no date; legacy records may use stored collection date", () => {
  assert.deepEqual(getTuitionCollectionDates({ amount_paid: 0, payment_date: null }, []), []);
  assert.deepEqual(
    getTuitionCollectionDates({ amount_paid: 600000, payment_date: "2026-10-27" }, []),
    ["2026-10-27"]
  );
  assert.deepEqual(
    getTuitionCollectionDates({ amount_paid: 600000, payment_date: "2026-10-27" }, [], false),
    []
  );
});

test("invalid dates do not display an invented date", () => {
  assert.deepEqual(
    getTuitionCollectionDates({ amount_paid: 100000, payment_date: "2026-10-27" }, [{ payment_date: "invalid" }]),
    ["2026-10-27"]
  );
  assert.equal(formatTuitionCollectionDate("invalid"), "—");
});
