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


export function vietnamScheduleDayKey(date: Date = new Date()) {
  const [year, month, day] = vietnamToday(date)
    .split("-")
    .map(Number);

  // Tính weekday từ date-key Việt Nam, không phụ thuộc timezone máy.
  const weekday = new Date(
    Date.UTC(year, month - 1, day)
  ).getUTCDay();

  // Quy ước của hệ thống:
  // T2=2 ... T7=7, CN=0.
  return String(weekday === 0 ? 0 : weekday + 1);
}

export function vietnamTodayLabel(date: Date = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
