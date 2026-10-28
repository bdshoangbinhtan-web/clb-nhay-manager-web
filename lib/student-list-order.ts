import { toVietnamDateKey } from "./vietnam-date.ts";

export type StudentWithAdmissionDate = {
  id: string;
  full_name: string;
  join_date: string | null;
  created_at: string | null;
  student_code?: string | null;
};

const vietnameseNameCollator = new Intl.Collator("vi-VN", {
  sensitivity: "base",
  numeric: true,
});

// join_date is the business date set on the student record, not the record's creation time.
// Older records without join_date fall back to their Vietnam-local creation date.
export function studentAdmissionDay(student: StudentWithAdmissionDate): string {
  const joinDate = student.join_date?.trim();
  if (joinDate && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(joinDate)) {
    return joinDate.slice(0, 10);
  }

  return student.created_at ? toVietnamDateKey(student.created_at) : "";
}

export function compareStudentsNewestFirst<T extends StudentWithAdmissionDate>(a: T, b: T): number {
  const dateComparison = studentAdmissionDay(b).localeCompare(studentAdmissionDay(a));
  if (dateComparison !== 0) return dateComparison;

  const nameComparison = vietnameseNameCollator.compare(a.full_name, b.full_name);
  if (nameComparison !== 0) return nameComparison;

  return vietnameseNameCollator.compare(a.student_code ?? "", b.student_code ?? "") ||
    a.id.localeCompare(b.id);
}
