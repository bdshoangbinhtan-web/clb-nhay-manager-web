export type TuitionRecord = {
  id: string;
  student_id: string;
  class_id: string | null;
  billing_month: string;
  amount_due: number;
  amount_paid: number;
  effective_amount_due?: number;
  effective_amount_paid?: number;
};

export type TuitionMembership = {
  student_id: string;
  class_id: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type TuitionPaymentAmount = { tuition_id: string; amount: number };
export type TuitionAdjustmentAmount = {
  tuition_id: string;
  target_tuition_id: string | null;
  action: string;
  amount: number;
};

export type TuitionDueStatus =
  | "PRE_LAUNCH"
  | "PAID_CURRENT"
  | "DUE"
  | "OVERDUE"
  | "PARTIAL"
  | "PAID_AHEAD"
  | "INACTIVE";

export const TUITION_TRACKING_START_MONTH = "2026-10";

export type MembershipTuitionStatus = {
  status: TuitionDueStatus;
  firstUnpaidMonth: string | null;
  paidThroughMonth: string | null;
  amountDue: number;
  amountPaid: number;
  remaining: number;
};

export function applyTuitionAdjustments(
  records: TuitionRecord[],
  payments: TuitionPaymentAmount[],
  adjustments: TuitionAdjustmentAmount[]
): TuitionRecord[] {
  const paymentsByTuition = new Map<string, number>();
  const cancelledByTuition = new Map<string, number>();
  const carriedIntoTuition = new Map<string, number>();

  for (const payment of payments) {
    paymentsByTuition.set(
      payment.tuition_id,
      (paymentsByTuition.get(payment.tuition_id) ?? 0) + Number(payment.amount || 0)
    );
  }
  for (const adjustment of adjustments) {
    if (adjustment.action === "cancel") {
      cancelledByTuition.set(
        adjustment.tuition_id,
        (cancelledByTuition.get(adjustment.tuition_id) ?? 0) + Number(adjustment.amount || 0)
      );
    }
    if (adjustment.action === "carry_forward" && adjustment.target_tuition_id) {
      carriedIntoTuition.set(
        adjustment.target_tuition_id,
        (carriedIntoTuition.get(adjustment.target_tuition_id) ?? 0) + Number(adjustment.amount || 0)
      );
    }
  }

  return records.map((record) => ({
    ...record,
    effective_amount_due: Math.max(
      Number(record.amount_due || 0) - (cancelledByTuition.get(record.id) ?? 0),
      0
    ),
    effective_amount_paid:
      Math.max(Number(record.amount_paid || 0), paymentsByTuition.get(record.id) ?? 0) +
      (carriedIntoTuition.get(record.id) ?? 0),
  }));
}

export function monthKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
}

export function addMonth(value: string, count = 1): string {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodDate(value: string): string {
  const normalized = monthKey(value);
  if (!normalized) throw new Error("Kỳ học phí không hợp lệ.");
  return `${normalized}-01`;
}

function recordsForMembership(
  membership: TuitionMembership,
  records: TuitionRecord[]
) {
  return records
    .filter(
      (record) =>
        record.student_id === membership.student_id &&
        record.class_id === membership.class_id
    )
    .map((record) => ({ ...record, period: monthKey(record.billing_month) }))
    .filter((record) => record.period !== null)
    .sort((a, b) => a.period!.localeCompare(b.period!));
}

export function getFirstUnpaidMonth(
  membership: TuitionMembership,
  records: TuitionRecord[],
  currentMonth: string
): string {
  const current = monthKey(currentMonth);
  if (!current) throw new Error("Tháng hiện tại không hợp lệ.");

  const history = recordsForMembership(membership, records);
  const start = monthKey(membership.start_date);
  const firstKnownPast = history.find((item) => item.period! <= current)?.period;
  // Missing/incomplete enrollment start dates must not create assumed debt.
  const naturalAnchor = start ?? firstKnownPast ?? current;
  const anchor = naturalAnchor < TUITION_TRACKING_START_MONTH
    ? TUITION_TRACKING_START_MONTH
    : naturalAnchor;
  // Walk through existing advance payments so the next collectible period
  // moves from October to November, December, and onward.
  const through = history.reduce(
    (latest, item) => item.period! >= anchor && item.period! > latest ? item.period! : latest,
    current > anchor ? current : anchor
  );
  let month = anchor;

  while (month <= through) {
    const row = history.find((item) => item.period === month);
    if (!row) return month;
    const due = Number(row.effective_amount_due ?? row.amount_due);
    const paid = Number(row.effective_amount_paid ?? row.amount_paid);
    if (due <= 0) {
      month = addMonth(month);
      continue;
    }
    if (paid < due) return month;
    month = addMonth(month);
  }

  return month;
}

export function getMembershipTuitionStatus(
  membership: TuitionMembership,
  studentStatus: string | null,
  classStatus: string | null,
  records: TuitionRecord[],
  currentMonth: string
): MembershipTuitionStatus {
  const current = monthKey(currentMonth);
  if (!current) throw new Error("Tháng hiện tại không hợp lệ.");

  if (
    membership.status !== "active" ||
    studentStatus !== "active" ||
    classStatus !== "active" ||
    (monthKey(membership.end_date) ?? "9999-12") < current
  ) {
    return {
      status: "INACTIVE",
      firstUnpaidMonth: null,
      paidThroughMonth: null,
      amountDue: 0,
      amountPaid: 0,
      remaining: 0,
    };
  }

  const history = recordsForMembership(membership, records);
  const firstUnpaidMonth = getFirstUnpaidMonth(membership, records, current);
  const firstUnpaidRecord = history.find(
    (item) => item.period === firstUnpaidMonth
  );
  const amountDue = Number(
    firstUnpaidRecord?.effective_amount_due ?? firstUnpaidRecord?.amount_due ?? 0
  );
  const amountPaid = Number(
    firstUnpaidRecord?.effective_amount_paid ?? firstUnpaidRecord?.amount_paid ?? 0
  );
  const remaining = Math.max(amountDue - amountPaid, 0);

  let paidThroughMonth: string | null = null;
  const naturalAnchor = monthKey(membership.start_date) ??
    history.find((item) => item.period! <= current)?.period ?? current;
  const anchor = naturalAnchor < TUITION_TRACKING_START_MONTH
    ? TUITION_TRACKING_START_MONTH
    : naturalAnchor;
  for (let month = anchor; month < firstUnpaidMonth; month = addMonth(month)) {
    const row = history.find((item) => item.period === month);
    if (!row || Number(row.effective_amount_paid ?? row.amount_paid) < Number(row.effective_amount_due ?? row.amount_due)) break;
    paidThroughMonth = month;
  }

  if (current < TUITION_TRACKING_START_MONTH) {
    return {
      status: "PRE_LAUNCH",
      firstUnpaidMonth,
      paidThroughMonth,
      amountDue,
      amountPaid,
      remaining,
    };
  }

  let status: TuitionDueStatus;
  if (firstUnpaidMonth <= current && firstUnpaidRecord && amountPaid > 0 && remaining > 0) {
    status = "PARTIAL";
  } else if (firstUnpaidMonth < current) {
    status = "OVERDUE";
  } else if (firstUnpaidMonth === current) {
    status = "DUE";
  } else if (history.some(
    (item) =>
      item.period! > current &&
      Number(item.effective_amount_paid ?? item.amount_paid) >=
        Number(item.effective_amount_due ?? item.amount_due)
  )) {
    status = "PAID_AHEAD";
  } else {
    status = "PAID_CURRENT";
  }

  return {
    status,
    firstUnpaidMonth,
    paidThroughMonth,
    amountDue,
    amountPaid,
    remaining,
  };
}

export function determineActiveClasses<T extends { id: string }>(
  studentId: string,
  classes: T[],
  memberships: TuitionMembership[]
): { classes: T[]; autoSelectedClassId: string } {
  const activeIds = new Set(
    memberships
      .filter((item) => item.student_id === studentId && item.status === "active")
      .map((item) => item.class_id)
  );
  const activeClasses = classes.filter((item) => activeIds.has(item.id));
  return {
    classes: activeClasses,
    autoSelectedClassId: activeClasses.length === 1 ? activeClasses[0].id : "",
  };
}
