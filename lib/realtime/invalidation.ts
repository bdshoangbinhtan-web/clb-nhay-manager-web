export const REALTIME_TABLES = [
  "attendance",
  "branches",
  "cash_account_openings",
  "cash_accounts",
  "cash_ledger",
  "cash_transfers",
  "class_sessions",
  "class_students",
  "class_teachers",
  "classes",
  "daily_cash_closings",
  "expenses",
  "finance_source_reversals",
  "other_revenues",
  "profiles",
  "students",
  "teacher_attendance",
  "teacher_payroll_details",
  "teacher_payrolls",
  "teacher_substitution_requests",
  "teacher_work_sessions",
  "teachers",
  "trial_class_leads",
  "trial_students",
  "tuition",
  "tuition_adjustments",
  "tuition_payments",
] as const;

export type RealtimeTable = (typeof REALTIME_TABLES)[number];

export type RealtimeTopic =
  | "activity-log"
  | "attendance"
  | "branches"
  | "classes"
  | "dashboard"
  | "expenses"
  | "finance"
  | "payroll"
  | "reports"
  | "settings"
  | "students"
  | "substitutions"
  | "teachers"
  | "trials"
  | "tuition";

export const REALTIME_TOPICS_BY_TABLE: Record<RealtimeTable, readonly RealtimeTopic[]> = {
  attendance: ["attendance", "classes", "dashboard", "payroll", "reports", "students"],
  branches: ["attendance", "branches", "classes", "dashboard", "expenses", "reports", "settings", "students", "trials", "tuition"],
  cash_account_openings: ["finance"],
  cash_accounts: ["finance"],
  cash_ledger: ["activity-log", "dashboard", "finance", "reports"],
  finance_source_reversals: ["expenses", "finance", "reports"],
  cash_transfers: ["activity-log", "finance"],
  class_sessions: ["attendance", "classes", "dashboard", "payroll", "reports", "substitutions"],
  class_students: ["attendance", "classes", "dashboard", "reports", "students", "tuition"],
  class_teachers: ["attendance", "classes", "dashboard", "payroll", "reports", "substitutions", "teachers"],
  classes: ["attendance", "branches", "classes", "dashboard", "payroll", "reports", "students", "substitutions", "trials", "tuition"],
  daily_cash_closings: ["activity-log", "finance"],
  expenses: ["dashboard", "expenses", "finance", "reports"],
  other_revenues: ["dashboard", "expenses", "finance", "reports"],
  profiles: ["dashboard", "reports", "settings", "teachers"],
  students: ["attendance", "classes", "dashboard", "reports", "students", "tuition"],
  teacher_attendance: ["attendance", "dashboard", "payroll", "reports", "teachers"],
  teacher_payroll_details: ["dashboard", "payroll", "reports", "teachers"],
  teacher_payrolls: ["dashboard", "payroll", "reports", "teachers"],
  teacher_substitution_requests: ["attendance", "classes", "dashboard", "payroll", "reports", "substitutions"],
  teacher_work_sessions: ["attendance", "classes", "dashboard", "payroll", "reports", "substitutions"],
  teachers: ["attendance", "classes", "dashboard", "payroll", "reports", "substitutions", "teachers"],
  trial_class_leads: ["dashboard", "reports", "trials"],
  trial_students: ["dashboard", "reports", "students", "trials"],
  tuition: ["dashboard", "reports", "students", "tuition"],
  tuition_adjustments: ["dashboard", "reports", "students", "tuition"],
  tuition_payments: ["dashboard", "finance", "reports", "students", "tuition"],
};

export function realtimeTopicsForTables(tables: Iterable<string>) {
  const topics = new Set<RealtimeTopic>();

  for (const table of tables) {
    const mapped = REALTIME_TOPICS_BY_TABLE[table as RealtimeTable];
    if (!mapped) continue;
    topics.add("activity-log");
    mapped.forEach((topic) => topics.add(topic));
  }

  return topics;
}

export function realtimeTopicsIntersect(
  subscribed: ReadonlySet<RealtimeTopic>,
  changed: ReadonlySet<RealtimeTopic>,
) {
  for (const topic of subscribed) {
    if (changed.has(topic)) return true;
  }
  return false;
}

export function createRealtimeEventCoalescer<T>(
  delayMs: number,
  onFlush: (events: ReadonlySet<T>) => void,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Set<T>();

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending.size) return;
    const batch = new Set(pending);
    pending.clear();
    onFlush(batch);
  }

  return {
    push(event: T) {
      pending.add(event);
      if (timer) return;
      timer = setTimeout(flush, delayMs);
    },
    flush,
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}
