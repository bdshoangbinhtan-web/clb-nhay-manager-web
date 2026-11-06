export type StudentTuitionInput = {
  join_date: string | null;
  tuition_resumed_on: string | null;
};

export type ClassTuitionInput = {
  monthly_fee: number;
  schedule_days: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
};

const DAY_MAP: Record<string, number> = {
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  "6": 5,
  "7": 6,
  "CN": 0,
};

function lessonsInMonth(
  joinDate: string | null,
  billingMonth: string,
  scheduleDays: string[] | null
) {
  if (!billingMonth || !scheduleDays?.length) return 0;

  const [year, month] = billingMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);

  let start = first;

  if (joinDate) {
    const joined = new Date(joinDate + "T00:00:00");

    if (
      joined.getFullYear() > year ||
      (joined.getFullYear() === year && joined.getMonth() > month - 1)
    ) {
      return 0;
    }

    if (joined > start) start = joined;
  }

  const wanted = scheduleDays
    .map((d) => DAY_MAP[d])
    .filter((d): d is number => d !== undefined);

  let count = 0;

  for (
    const d = new Date(start);
    d <= last;
    d.setDate(d.getDate() + 1)
  ) {
    if (wanted.includes(d.getDay())) count++;
  }

  return count;
}

export function suggestedTuitionAmount(
  student: StudentTuitionInput,
  classItem: ClassTuitionInput,
  billingMonth: string,
  enrollmentStartDate: string | null = null
) {
  // A resumed student pays only for scheduled days remaining in the resume month.
  const resumedThisPeriod = student.tuition_resumed_on?.slice(0, 7) === billingMonth
    ? student.tuition_resumed_on
    : null;
  const effectiveJoinDate = [student.join_date, enrollmentStartDate, resumedThisPeriod]
    .filter((value): value is string => !!value)
    .sort()
    .at(-1) ?? null;
  const lessons = lessonsInMonth(
    effectiveJoinDate,
    billingMonth,
    classItem.schedule_days
  );
  const startMinutes = classItem.schedule_start
    ? Number(classItem.schedule_start.slice(0, 2)) * 60 +
      Number(classItem.schedule_start.slice(3, 5))
    : 0;
  const endMinutes = classItem.schedule_end
    ? Number(classItem.schedule_end.slice(0, 2)) * 60 +
      Number(classItem.schedule_end.slice(3, 5))
    : 0;
  const durationMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : 60;
  const feePerLesson = (durationMinutes / 60) * 50000;

  if (!effectiveJoinDate) return Number(classItem.monthly_fee);

  const [year, month] = billingMonth.split("-").map(Number);
  const joined = new Date(effectiveJoinDate + "T00:00:00");
  if (joined.getFullYear() === year && joined.getMonth() === month - 1) {
    return Math.round(Math.min(lessons * feePerLesson, Number(classItem.monthly_fee)));
  }
  if (joined < new Date(year, month - 1, 1)) return Number(classItem.monthly_fee);
  return 0;
}

export function requiresTuitionVarianceExplanation(actual: number, proposed: number): boolean {
  return Number.isFinite(actual) && Number.isFinite(proposed) && Math.abs(actual-proposed)>0.01;
}
