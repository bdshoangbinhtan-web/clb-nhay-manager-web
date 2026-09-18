-- Phase 1: additive Class Session foundation.
--
-- This migration deliberately does not backfill, delete, recalculate, or
-- redirect any existing attendance/payroll flow. Existing UUIDs and legacy
-- composite keys remain intact so the application can continue to run while
-- later phases link historical rows to class_sessions.
begin;

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  session_date date not null,
  start_time time without time zone,
  end_time time without time zone,
  branch_id uuid references public.branches(id) on delete restrict,
  scheduled_teacher_id uuid references public.teachers(id) on delete restrict,
  actual_teacher_id uuid references public.teachers(id) on delete restrict,
  teaching_type text not null default 'regular',
  status text not null default 'scheduled',
  substitution_request_id uuid
    references public.teacher_substitution_requests(id) on delete restrict,
  salary_rate_snapshot numeric(12, 2),
  salary_override numeric(12, 2),
  salary_override_note text,
  salary_override_by uuid references public.profiles(id) on delete restrict,
  salary_override_at timestamptz,
  origin_type text not null default 'schedule',
  legacy_identity_key text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint class_sessions_teaching_type_check
    check (teaching_type in ('regular', 'substitute', 'makeup', 'extra')),
  constraint class_sessions_status_check
    check (status in ('scheduled', 'completed', 'cancelled')),
  constraint class_sessions_origin_type_check
    check (origin_type in ('schedule', 'manual', 'legacy_backfill')),
  constraint class_sessions_time_order_check
    check (start_time is null or end_time is null or end_time > start_time),
  constraint class_sessions_salary_snapshot_nonnegative
    check (salary_rate_snapshot is null or salary_rate_snapshot >= 0),
  constraint class_sessions_salary_override_nonnegative
    check (salary_override is null or salary_override >= 0),
  constraint class_sessions_completed_teacher_check
    check (
      status <> 'completed'
      or actual_teacher_id is not null
      or origin_type = 'legacy_backfill'
    ),
  constraint class_sessions_cancelled_timestamp_check
    check (status <> 'cancelled' or cancelled_at is not null),
  constraint class_sessions_completed_timestamp_check
    check (status <> 'completed' or completed_at is not null)
);

comment on table public.class_sessions is
  'One concrete class occurrence. classes remains the recurring schedule template.';
comment on column public.class_sessions.branch_id is
  'Branch snapshot for this occurrence; do not re-derive historical payroll allocation from classes.branch_id.';
comment on column public.class_sessions.salary_rate_snapshot is
  'Immutable base salary amount for this occurrence once completed or included in payroll.';
comment on column public.class_sessions.salary_override is
  'Optional pre-payroll override amount. Locked/paid payroll details remain the final immutable accounting snapshot.';
comment on column public.class_sessions.legacy_identity_key is
  'Temporary-compatible identity used only by deterministic legacy backfill; new sessions leave it NULL.';

create unique index if not exists class_sessions_class_date_start_unique
  on public.class_sessions (class_id, session_date, start_time)
  where start_time is not null;

create unique index if not exists class_sessions_legacy_identity_unique
  on public.class_sessions (legacy_identity_key)
  where legacy_identity_key is not null;

create unique index if not exists class_sessions_substitution_request_unique
  on public.class_sessions (substitution_request_id)
  where substitution_request_id is not null;

create index if not exists class_sessions_class_date_idx
  on public.class_sessions (class_id, session_date);
create index if not exists class_sessions_branch_date_idx
  on public.class_sessions (branch_id, session_date);
create index if not exists class_sessions_scheduled_teacher_date_idx
  on public.class_sessions (scheduled_teacher_id, session_date);
create index if not exists class_sessions_actual_teacher_date_idx
  on public.class_sessions (actual_teacher_id, session_date);
create index if not exists class_sessions_status_date_idx
  on public.class_sessions (status, session_date);

alter table public.attendance
  add column if not exists class_session_id uuid;
alter table public.teacher_attendance
  add column if not exists class_session_id uuid;
alter table public.teacher_work_sessions
  add column if not exists class_session_id uuid;
alter table public.teacher_substitution_requests
  add column if not exists class_session_id uuid;
alter table public.teacher_payroll_details
  add column if not exists class_session_id uuid,
  add column if not exists teacher_work_session_id uuid;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_class_session_id_fkey'
  ) then
    alter table public.attendance
      add constraint attendance_class_session_id_fkey
      foreign key (class_session_id)
      references public.class_sessions(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.teacher_attendance'::regclass
      and conname = 'teacher_attendance_class_session_id_fkey'
  ) then
    alter table public.teacher_attendance
      add constraint teacher_attendance_class_session_id_fkey
      foreign key (class_session_id)
      references public.class_sessions(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.teacher_work_sessions'::regclass
      and conname = 'teacher_work_sessions_class_session_id_fkey'
  ) then
    alter table public.teacher_work_sessions
      add constraint teacher_work_sessions_class_session_id_fkey
      foreign key (class_session_id)
      references public.class_sessions(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.teacher_substitution_requests'::regclass
      and conname = 'teacher_substitution_requests_class_session_id_fkey'
  ) then
    alter table public.teacher_substitution_requests
      add constraint teacher_substitution_requests_class_session_id_fkey
      foreign key (class_session_id)
      references public.class_sessions(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.teacher_payroll_details'::regclass
      and conname = 'teacher_payroll_details_class_session_id_fkey'
  ) then
    alter table public.teacher_payroll_details
      add constraint teacher_payroll_details_class_session_id_fkey
      foreign key (class_session_id)
      references public.class_sessions(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.teacher_payroll_details'::regclass
      and conname = 'teacher_payroll_details_work_session_id_fkey'
  ) then
    alter table public.teacher_payroll_details
      add constraint teacher_payroll_details_work_session_id_fkey
      foreign key (teacher_work_session_id)
      references public.teacher_work_sessions(id)
      on delete set null
      not valid;
  end if;
end
$migration$;

create index if not exists attendance_class_session_id_idx
  on public.attendance (class_session_id);
create index if not exists teacher_attendance_class_session_id_idx
  on public.teacher_attendance (class_session_id);
create index if not exists teacher_work_sessions_class_session_id_idx
  on public.teacher_work_sessions (class_session_id);
create index if not exists teacher_substitution_requests_class_session_id_idx
  on public.teacher_substitution_requests (class_session_id);
create index if not exists teacher_payroll_details_class_session_id_idx
  on public.teacher_payroll_details (class_session_id);
create index if not exists teacher_payroll_details_work_session_id_idx
  on public.teacher_payroll_details (teacher_work_session_id);

create or replace function public.touch_class_session_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.touch_class_session_updated_at() from public;

drop trigger if exists touch_class_session_updated_at
on public.class_sessions;

create trigger touch_class_session_updated_at
before update on public.class_sessions
for each row
execute function public.touch_class_session_updated_at();

alter table public.class_sessions enable row level security;

-- Intentionally no broad direct-access policy in the foundation phase.
-- Later migrations expose narrowly scoped SECURITY DEFINER RPCs only after
-- backfill and dual-write invariants are in place.

commit;
