export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

function vietnamDateParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

export function vietnamToday(date: Date = new Date()) {
  const { year, month, day } = vietnamDateParts(date);
  return `${year}-${month}-${day}`;
}

export function vietnamCurrentMonth(date: Date = new Date()) {
  const { year, month } = vietnamDateParts(date);
  return `${year}-${month}`;
}

export function vietnamMonthStart(date: Date = new Date()) {
  return `${vietnamCurrentMonth(date)}-01`;
}

export function toVietnamDateKey(
  value: Date | string | number
) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return vietnamToday(date);
}
