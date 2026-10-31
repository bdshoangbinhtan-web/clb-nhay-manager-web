/**
 * Tuition payment dates must be read from actual collection transactions,
 * not inferred from billing_month (advance collections can be in earlier months).
 */
type TuitionWithPaymentDate = {
  amount_paid: number | null;
  payment_date: string | null;
};

type PaymentWithDate = {
  payment_date: string | null;
};

const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function getTuitionCollectionDates(
  tuition: TuitionWithPaymentDate | null | undefined,
  payments: readonly PaymentWithDate[],
  allowLegacyFallback = true
): string[] {
  const dates = payments
    .map((payment) => payment.payment_date)
    .filter((date): date is string => !!date && DATE_KEY_PATTERN.test(date));

  if (dates.length > 0) {
    return [...new Set(dates)].sort((left, right) => right.localeCompare(left));
  }

  // Older records may have only the date recorded on the tuition row.
  // Do not use the fallback in privacy mode (where cash payments are hidden).
  if (
    allowLegacyFallback &&
    tuition &&
    Number(tuition.amount_paid ?? 0) > 0 &&
    tuition.payment_date &&
    DATE_KEY_PATTERN.test(tuition.payment_date)
  ) {
    return [tuition.payment_date];
  }

  return [];
}

export function formatTuitionCollectionDate(date: string): string {
  if (!DATE_KEY_PATTERN.test(date)) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
