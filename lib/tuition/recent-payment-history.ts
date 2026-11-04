/**
 * Read-only helpers for the recent tuition collection panel.
 * The payment timestamp is the audit/recorded time; payment_date is the
 * business collection date and may differ for historical/backdated receipts.
 */
export type HistoryPayment = {
  id: string;
  tuition_id: string;
  amount: number;
  payment_method: string | null;
  payment_date: string | null;
  created_at: string | null;
  receipt_no: string | null;
};

export type HistoryTuition = {
  id: string;
  student_id: string;
  class_id: string | null;
  billing_month: string;
  note: string | null;
};

export function newestTuitionPayments<
  P extends HistoryPayment,
  T extends HistoryTuition,
>(payments: readonly P[], tuitions: readonly T[]): Array<{ payment: P; tuition: T }> {
  // Do not show voided duplicate receipts as successful collection history.
  const tuitionById = new Map(
    tuitions
      .filter((item) => !item.note?.includes("[VOID_DUPLICATE_TRANSFER]"))
      .map((item) => [item.id, item])
  );

  return payments.flatMap((payment) => {
    const tuition = tuitionById.get(payment.tuition_id);
    return tuition && Number(payment.amount) > 0 ? [{ payment, tuition }] : [];
  }).sort((left, right) => {
    const leftRecorded = Date.parse(left.payment.created_at ?? "") || 0;
    const rightRecorded = Date.parse(right.payment.created_at ?? "") || 0;
    return rightRecorded - leftRecorded || right.payment.id.localeCompare(left.payment.id);
  });
}

export function formatTuitionRecordedTimestamp(value: string | null): string {
  if (!value) return "Chưa có thời điểm ghi nhận";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Chưa có thời điểm ghi nhận";

  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === kind)?.value ?? "--";

  return `${part("day")}/${part("month")}/${part("year")} · ${part("hour")}:${part("minute")}:${part("second")}`;
}
