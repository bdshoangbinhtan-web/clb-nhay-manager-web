/**
 * Keep cash receipts (payment_date) separate from tuition attributed to
 * the service/billing month (tuition.billing_month).
 * These figures reflect collected amounts allocated to a period, not the
 * full accrual value of unpaid tuition invoices.
 */
export type TuitionRelation = {
  billing_month: string | null;
  branch_id: string | null;
  note: string | null;
};

export type TuitionLinkedAmount = {
  amount: number;
  tuition?: TuitionRelation | TuitionRelation[] | null;
};

export type TuitionCollection = TuitionLinkedAmount & {
  payment_date: string | null;
};

export function linkedTuition(row: TuitionLinkedAmount): TuitionRelation | null {
  const value = row.tuition;
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function isVoidedDuplicateTuition(row: TuitionLinkedAmount): boolean {
  return linkedTuition(row)?.note?.includes("[VOID_DUPLICATE_TRANSFER]") ?? false;
}

export function sumTuitionByBillingPeriod<T extends TuitionLinkedAmount>(
  rows: readonly T[],
  period: string,
  branchId = ""
): number {
  return rows.reduce((sum, item) => {
    const tuition = linkedTuition(item);
    if (!tuition?.billing_month?.startsWith(period) || isVoidedDuplicateTuition(item)) return sum;
    if (branchId && tuition.branch_id !== branchId) return sum;
    return sum + Number(item.amount || 0);
  }, 0);
}

export function sumAdvanceTuitionCollected<T extends TuitionCollection>(
  rows: readonly T[],
  collectionPeriod: string,
  branchId = ""
): number {
  return rows.reduce((sum, item) => {
    const tuition = linkedTuition(item);
    if (!item.payment_date?.startsWith(collectionPeriod) || !tuition?.billing_month) return sum;
    if (isVoidedDuplicateTuition(item) || (branchId && tuition.branch_id !== branchId)) return sum;
    // For a month report, count future months; for a year report, future years.
    const servicePeriod = tuition.billing_month.slice(0, collectionPeriod.length);
    return servicePeriod > collectionPeriod ? sum + Number(item.amount || 0) : sum;
  }, 0);
}
