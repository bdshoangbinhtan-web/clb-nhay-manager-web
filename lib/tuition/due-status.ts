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

export function applyTuitionAdjustments<T extends TuitionRecord>(
  records: T[],
  payments: TuitionPaymentAmount[],
  adjustments: TuitionAdjustmentAmount[]
): T[] {
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


/**
 * Transfer changes class membership, not the student's already-paid billing period.
 * All rows below are view-only projections; no receipt, tuition or cash ledger is written.
 *
 * A previous class counts only if it has a verified transfer_out whose transfer
 * date matches the next enrollment's start date. The chain also handles A -> B -> C
 * and same-day returns to an earlier class. Independently added classes are not
 * credited merely because the student paid for a different class.
 */

export type TuitionWaiverPeriod = {
  student_id: string;
  class_id: string;
  billing_month: string;
};

/** A waiver is a non-collectible period even if membership infers a debt. */
export function applyTuitionWaivers<T extends TuitionRecord>(
  records: T[],
  waivers: TuitionWaiverPeriod[]
): (T & { waived?: boolean })[] {
  const result: (T & { waived?: boolean })[] = records.map((row) => ({ ...row }));
  const keyFor = (studentId: string, classId: string, period: string | null) =>
    [studentId, classId, period ?? ""].join("__");
  const existing = new Set(
    records.filter((row) => !!row.class_id).map((row) =>
      keyFor(row.student_id, row.class_id!, monthKey(row.billing_month))
    )
  );
  for (const waiver of waivers) {
    const period = monthKey(waiver.billing_month);
    if (!period) continue;
    const key = keyFor(waiver.student_id, waiver.class_id, period);
    // Never mask a real payment if inconsistent legacy data appears.
    if (existing.has(key)) continue;
    existing.add(key);
    result.push({
      id: "waived:" + key,
      student_id: waiver.student_id,
      class_id: waiver.class_id,
      billing_month: period + "-01",
      amount_due: 0,
      amount_paid: 0,
      effective_amount_due: 0,
      effective_amount_paid: 0,
      waived: true,
    } as T & { waived?: boolean });
  }
  return result;
}

export type TuitionTransferOut = {
  student_id: string;
  class_id: string;
  start_date: string | null;
  end_date: string | null;
  changed_at: string;
};

export type TransferCovered<T> = T & { covered_by_transfer?: boolean };

export function applyTransferredTuitionCoverage<T extends TuitionRecord>(
  paidRecords: T[],
  memberships: TuitionMembership[],
  transferOut: TuitionTransferOut[]
): TransferCovered<T>[] {
  const result: TransferCovered<T>[] = paidRecords.map((item) => ({ ...item }));
  const transferByStudent = new Map<string, TuitionTransferOut[]>();
  const recordsByStudent = new Map<string, T[]>();
  const targetByPeriod = new Map<string, TransferCovered<T>>();

  const key = (studentId: string, classId: string, period: string) =>
    `${studentId}__${classId}__${period}`;

  for (const row of paidRecords) {
    const studentRows = recordsByStudent.get(row.student_id) ?? [];
    studentRows.push(row);
    recordsByStudent.set(row.student_id, studentRows);
  }
  for (const row of result) {
    const period = monthKey(row.billing_month);
    if (row.class_id && period) targetByPeriod.set(key(row.student_id, row.class_id, period), row);
  }
  for (const event of transferOut) {
    if (!event.end_date) continue;
    const studentEvents = transferByStudent.get(event.student_id) ?? [];
    studentEvents.push(event);
    transferByStudent.set(event.student_id, studentEvents);
  }
  for (const events of transferByStudent.values()) {
    events.sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  }

  for (const membership of memberships) {
    if (membership.status !== "active" || !membership.start_date) continue;
    const events = transferByStudent.get(membership.student_id) ?? [];
    const studentRecords = recordsByStudent.get(membership.student_id) ?? [];
    let classId = membership.class_id;
    let startDate: string | null = membership.start_date;
    let before = "9999-12-31T23:59:59Z";
    const visited = new Set<string>();

    for (let depth = 0; depth < 30 && startDate; depth += 1) {
      const previous = events.find((event) =>
        event.end_date === startDate &&
        event.class_id !== classId &&
        event.changed_at < before &&
        !visited.has(`${event.class_id}:${event.changed_at}`)
      );
      if (!previous) break;
      visited.add(`${previous.class_id}:${previous.changed_at}`);
      const transferMonth = monthKey(previous.end_date);

      for (const source of studentRecords) {
        const period = monthKey(source.billing_month);
        if (!period || !transferMonth || period < transferMonth || source.class_id !== previous.class_id) continue;

        const due = Number(source.effective_amount_due ?? source.amount_due);
        const paid = Number(source.effective_amount_paid ?? source.amount_paid);
        // Do not waive a genuine balance, or falsely count a partial payment as full.
        if (!(due > 0 && paid >= due)) continue;

        const targetKey = key(membership.student_id, membership.class_id, period);
        const current = targetByPeriod.get(targetKey);
        if (current) {
          const currentDue = Number(current.effective_amount_due ?? current.amount_due);
          const currentPaid = Number(current.effective_amount_paid ?? current.amount_paid);
          // A stored but entirely unpaid duplicate invoice must not revive a paid debt.
          // Never overwrite a real payment already recorded in the destination class.
          if (currentDue > 0 && currentPaid === 0 && Number(current.amount_paid) === 0) {
            current.effective_amount_paid = currentDue;
            current.covered_by_transfer = true;
          }
          continue;
        }

        const projection: TransferCovered<T> = {
          ...source,
          id: `transfer-coverage:${membership.student_id}:${membership.class_id}:${period}`,
          class_id: membership.class_id,
          effective_amount_due: due,
          effective_amount_paid: paid,
          covered_by_transfer: true,
        };
        result.push(projection);
        targetByPeriod.set(targetKey, projection);
      }

      classId = previous.class_id;
      startDate = previous.start_date;
      before = previous.changed_at;
    }
  }

  return result;
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
