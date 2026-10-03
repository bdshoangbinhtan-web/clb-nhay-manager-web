-- The payroll model now uses the class salary snapshot for each teaching session.
-- Keep legacy rows (without a class snapshot) valid, while ensuring new snapshot-priced
-- sessions keep calculated_amount aligned with the immutable class snapshot.

alter table public.teacher_work_sessions
  drop constraint if exists teacher_work_session_amount_check;

alter table public.teacher_work_sessions
  drop constraint if exists teacher_work_session_class_salary_amount_check;

alter table public.teacher_work_sessions
  add constraint teacher_work_session_class_salary_amount_check
  check (
    class_salary_per_session_snapshot is null
    or calculated_amount = class_salary_per_session_snapshot
  ) not valid;

alter table public.teacher_work_sessions
  validate constraint teacher_work_session_class_salary_amount_check;
