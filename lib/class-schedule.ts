const SUNDAY_KEYS = new Set(["0", "CN"]);

export function normalizeScheduleDay(day: unknown) {
  const value = String(day ?? "").trim().toUpperCase();

  if (SUNDAY_KEYS.has(value)) return "0";
  if (/^[2-7]$/.test(value)) return value;

  return null;
}

export function scheduleIncludesDay(
  scheduleDays: readonly unknown[] | null | undefined,
  day: unknown
) {
  const expected = normalizeScheduleDay(day);

  if (!expected || !Array.isArray(scheduleDays)) return false;

  return scheduleDays.some(
    (scheduleDay) => normalizeScheduleDay(scheduleDay) === expected
  );
}

export function normalizedScheduleDayCount(
  scheduleDays: readonly unknown[] | null | undefined
) {
  if (!Array.isArray(scheduleDays)) return 0;

  return new Set(
    scheduleDays
      .map(normalizeScheduleDay)
      .filter((day): day is string => day !== null)
  ).size;
}
