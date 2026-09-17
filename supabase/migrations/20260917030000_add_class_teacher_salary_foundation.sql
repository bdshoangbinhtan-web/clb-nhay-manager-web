-- Phase 1: additive schema only. Existing attendance, work sessions and payroll
-- rows are not updated, deleted or recalculated by this migration.
begin;

alter table public.classes
  add column if not exists teacher_salary_per_session numeric(12, 2);

comment on column public.classes.teacher_salary_per_session is
  'Teacher salary for one teaching session. Not used by payroll in Phase 1.';

alter table public.classes
  drop constraint if exists classes_teacher_salary_per_session_nonnegative;
alter table public.classes
  add constraint classes_teacher_salary_per_session_nonnegative
  check (teacher_salary_per_session is null or teacher_salary_per_session >= 0)
  not valid;
alter table public.classes
  validate constraint classes_teacher_salary_per_session_nonnegative;

alter table public.teacher_work_sessions
  add column if not exists class_salary_per_session_snapshot numeric(12, 2);

comment on column public.teacher_work_sessions.class_salary_per_session_snapshot is
  'Reserved Phase 2 snapshot. NULL means legacy payroll remains authoritative.';

alter table public.teacher_work_sessions
  drop constraint if exists teacher_work_sessions_class_salary_snapshot_nonnegative;
alter table public.teacher_work_sessions
  add constraint teacher_work_sessions_class_salary_snapshot_nonnegative
  check (
    class_salary_per_session_snapshot is null
    or class_salary_per_session_snapshot >= 0
  ) not valid;
alter table public.teacher_work_sessions
  validate constraint teacher_work_sessions_class_salary_snapshot_nonnegative;

create or replace function public.guard_class_teacher_salary_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.teacher_salary_per_session is distinct from old.teacher_salary_per_session
     and coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1 from public.profiles
       where id = auth.uid()
         and role = 'admin'
         and coalesce(is_active, true)
     ) then
    raise exception 'Only an active admin may change class teacher salary'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_class_teacher_salary_update on public.classes;
create trigger protect_class_teacher_salary_update
before update of teacher_salary_per_session on public.classes
for each row execute function public.guard_class_teacher_salary_update();

revoke all on function public.guard_class_teacher_salary_update() from public;

create or replace function public.update_class_teacher_salary(
  p_class_id uuid,
  p_salary numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(is_active, true)
  ) then
    raise exception 'Only an active admin may change class teacher salary'
      using errcode = '42501';
  end if;

  if p_salary is null or p_salary <= 0 then
    raise exception 'Class teacher salary must be greater than zero'
      using errcode = '22023';
  end if;

  update public.classes
  set teacher_salary_per_session = p_salary
  where id = p_class_id;

  if not found then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_class_teacher_salary(uuid, numeric) from public;
grant execute on function public.update_class_teacher_salary(uuid, numeric) to authenticated;

commit;
