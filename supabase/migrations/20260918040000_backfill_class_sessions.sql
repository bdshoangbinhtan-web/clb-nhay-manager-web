-- Phase 2: deterministic, lossless legacy backfill.
--
-- The transaction aborts before writing when one legacy class/date cannot map
-- to exactly one actual teacher/work session. This is intentional: the old
-- model cannot distinguish two occurrences of the same class on the same date,
-- so guessing would corrupt attendance or payroll history.
begin;

create temporary table class_session_legacy_occurrences
on commit drop
as
select distinct source.class_id, source.session_date
from (
  select ws.class_id, ws.session_date
  from public.teacher_work_sessions ws

  union all

  select ta.class_id, ta.attendance_date
  from public.teacher_attendance ta

  union all

  select a.class_id, a.attendance_date
  from public.attendance a

  union all

  select r.class_id, r.session_date
  from public.teacher_substitution_requests r

  union all

  select d.class_id, d.attendance_date
  from public.teacher_payroll_details d
  where d.attendance_date is not null
) source;

create unique index class_session_legacy_occurrences_unique
  on class_session_legacy_occurrences (class_id, session_date);

do $preflight$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from (
    select ws.class_id, ws.session_date
    from public.teacher_work_sessions ws
    group by ws.class_id, ws.session_date
    having count(*) > 1
  ) conflicts;

  if v_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'Ambiguous legacy teacher work sessions detected.',
      detail = 'CLASS_SESSION_WORK_SESSION_COLLISION:' || v_count::text,
      hint = 'Reconcile each class/date with more than one work-session row before rerunning this migration.';
  end if;

  select count(*)
  into v_count
  from (
    select ta.class_id, ta.attendance_date
    from public.teacher_attendance ta
    where ta.status = 'taught'
    group by ta.class_id, ta.attendance_date
    having count(distinct ta.teacher_id) > 1
  ) conflicts;

  if v_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'Ambiguous taught teachers detected for a legacy class/date.',
      detail = 'CLASS_SESSION_TEACHER_ATTENDANCE_COLLISION:' || v_count::text,
      hint = 'Resolve class/date rows with more than one taught teacher before backfill.';
  end if;

  select count(*)
  into v_count
  from (
    select r.class_id, r.session_date
    from public.teacher_substitution_requests r
    where r.status = 'approved'
    group by r.class_id, r.session_date
    having count(*) > 1
  ) conflicts;

  if v_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'Multiple approved substitution requests target one legacy class/date.',
      detail = 'CLASS_SESSION_APPROVED_SUBSTITUTION_COLLISION:' || v_count::text,
      hint = 'Keep exactly one approved substitution per class/date before backfill.';
  end if;

  select count(*)
  into v_count
  from (
    select candidates.class_id, candidates.session_date
    from (
      select ws.class_id, ws.session_date, ws.actual_teacher_id as teacher_id
      from public.teacher_work_sessions ws

      union all

      select ta.class_id, ta.attendance_date, ta.teacher_id
      from public.teacher_attendance ta
      where ta.status = 'taught'

      union all

      select a.class_id, a.attendance_date, a.teacher_id
      from public.attendance a
      where a.teacher_id is not null
        and not exists (
          select 1
          from public.teacher_attendance absent
          where absent.class_id = a.class_id
            and absent.attendance_date = a.attendance_date
            and absent.teacher_id = a.teacher_id
            and absent.status = 'absent'
        )

      union all

      select d.class_id, d.attendance_date,
             coalesce(d.actual_teacher_id, d.teacher_id)
      from public.teacher_payroll_details d
      where d.attendance_date is not null
        and coalesce(d.actual_teacher_id, d.teacher_id) is not null
    ) candidates
    group by candidates.class_id, candidates.session_date
    having count(distinct candidates.teacher_id) > 1
  ) conflicts;

  if v_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'Conflicting actual teachers detected across legacy session sources.',
      detail = 'CLASS_SESSION_ACTUAL_TEACHER_COLLISION:' || v_count::text,
      hint = 'Reconcile work-session, attendance, and payroll teacher IDs for each class/date before backfill.';
  end if;

  select count(*)
  into v_count
  from class_session_legacy_occurrences o
  where (
    select count(*)
    from public.class_sessions cs
    where cs.class_id = o.class_id
      and cs.session_date = o.session_date
  ) > 1;

  if v_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'Existing class sessions are ambiguous for legacy backfill.',
      detail = 'CLASS_SESSION_EXISTING_TARGET_COLLISION:' || v_count::text,
      hint = 'Map the legacy rows explicitly before rerunning the automatic backfill.';
  end if;
end
$preflight$;

insert into public.class_sessions (
  class_id,
  session_date,
  start_time,
  end_time,
  branch_id,
  scheduled_teacher_id,
  actual_teacher_id,
  teaching_type,
  status,
  substitution_request_id,
  salary_rate_snapshot,
  salary_override,
  salary_override_note,
  origin_type,
  legacy_identity_key,
  completed_at,
  created_at,
  updated_at
)
select
  o.class_id,
  o.session_date,
  c.schedule_start,
  c.schedule_end,
  c.branch_id,
  coalesce(
    ws.standing_teacher_id,
    pd.standing_teacher_id,
    approved_request.standing_teacher_id,
    primary_teacher.teacher_id
  ) as scheduled_teacher_id,
  coalesce(
    ws.actual_teacher_id,
    pd.actual_teacher_id,
    pd.teacher_id,
    taught.teacher_id,
    student_attendance.teacher_id
  ) as actual_teacher_id,
  case
    when ws.teaching_type = 'substitute'
      or ws.substitution_request_id is not null
      or approved_request.id is not null
      or coalesce(pd.is_substitute, false)
    then 'substitute'
    else 'regular'
  end as teaching_type,
  case
    when ws.id is not null
      or taught.teacher_id is not null
      or student_attendance.has_attendance
      or pd.id is not null
    then 'completed'
    else 'scheduled'
  end as status,
  coalesce(ws.substitution_request_id, approved_request.id)
    as substitution_request_id,
  coalesce(
    ws.class_salary_per_session_snapshot,
    ws.calculated_amount,
    pd.calculated_amount,
    case
      when pd.salary_rate is not null
      then pd.salary_rate * coalesce(pd.duration_multiplier, 1)
      else null
    end,
    case
      when ws.id is null
       and taught.teacher_id is null
       and not coalesce(student_attendance.has_attendance, false)
       and pd.id is null
      then c.teacher_salary_per_session
      else null
    end
  ) as salary_rate_snapshot,
  coalesce(
    ws.override_amount,
    pd.override_amount,
    case when coalesce(pd.amount_override, false) then pd.amount end
  ) as salary_override,
  coalesce(ws.override_note, pd.note) as salary_override_note,
  'legacy_backfill' as origin_type,
  'legacy:' || o.class_id::text || ':' || o.session_date::text
    as legacy_identity_key,
  case
    when ws.id is not null
      or taught.teacher_id is not null
      or student_attendance.has_attendance
      or pd.id is not null
    then coalesce(
      ws.confirmed_at,
      ws.created_at,
      taught.created_at,
      student_attendance.recorded_at,
      pd.created_at,
      now()
    )
    else null
  end as completed_at,
  coalesce(
    least(
      ws.created_at,
      approved_request.created_at,
      taught.created_at,
      student_attendance.recorded_at,
      pd.created_at
    ),
    ws.created_at,
    approved_request.created_at,
    taught.created_at,
    student_attendance.recorded_at,
    pd.created_at,
    now()
  ) as created_at,
  now() as updated_at
from class_session_legacy_occurrences o
join public.classes c on c.id = o.class_id
left join lateral (
  select work.*
  from public.teacher_work_sessions work
  where work.class_id = o.class_id
    and work.session_date = o.session_date
  order by work.created_at desc, work.id
  limit 1
) ws on true
left join lateral (
  select detail.*
  from public.teacher_payroll_details detail
  join public.teacher_payrolls payroll on payroll.id = detail.payroll_id
  where detail.class_id = o.class_id
    and detail.attendance_date = o.session_date
  order by
    case payroll.status when 'paid' then 1 when 'locked' then 2 else 3 end,
    detail.created_at desc,
    detail.id
  limit 1
) pd on true
left join lateral (
  select request.*
  from public.teacher_substitution_requests request
  where request.class_id = o.class_id
    and request.session_date = o.session_date
    and request.status = 'approved'
  order by request.created_at desc, request.id
  limit 1
) approved_request on true
left join lateral (
  select ta.teacher_id, ta.created_at
  from public.teacher_attendance ta
  where ta.class_id = o.class_id
    and ta.attendance_date = o.session_date
    and ta.status = 'taught'
  order by ta.created_at desc, ta.id
  limit 1
) taught on true
left join lateral (
  select
    true as has_attendance,
    min(a.recorded_at) as recorded_at,
    (array_agg(a.teacher_id order by a.recorded_at desc)
      filter (
        where a.teacher_id is not null
          and not exists (
            select 1
            from public.teacher_attendance absent
            where absent.class_id = a.class_id
              and absent.attendance_date = a.attendance_date
              and absent.teacher_id = a.teacher_id
              and absent.status = 'absent'
          )
      ))[1] as teacher_id
  from public.attendance a
  where a.class_id = o.class_id
    and a.attendance_date = o.session_date
  having count(*) > 0
) student_attendance on true
left join lateral (
  select ct.teacher_id
  from public.class_teachers ct
  where ct.class_id = o.class_id
    and ct.is_primary = true
  order by ct.teacher_id
  limit 1
) primary_teacher on true
where not exists (
  select 1
  from public.class_sessions existing
  where existing.class_id = o.class_id
    and existing.session_date = o.session_date
)
on conflict do nothing;

do $mapping_check$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from class_session_legacy_occurrences o
  where (
    select count(*)
    from public.class_sessions cs
    where cs.class_id = o.class_id
      and cs.session_date = o.session_date
  ) <> 1;

  if v_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'Legacy occurrences did not map one-to-one to class sessions.',
      detail = 'CLASS_SESSION_BACKFILL_MAPPING_FAILURE:' || v_count::text,
      hint = 'The transaction has been rolled back. Inspect class/date uniqueness and retry.';
  end if;
end
$mapping_check$;

update public.attendance a
set class_session_id = cs.id
from public.class_sessions cs
where a.class_session_id is null
  and cs.class_id = a.class_id
  and cs.session_date = a.attendance_date;

update public.teacher_attendance ta
set class_session_id = cs.id
from public.class_sessions cs
where ta.class_session_id is null
  and cs.class_id = ta.class_id
  and cs.session_date = ta.attendance_date;

update public.teacher_work_sessions ws
set class_session_id = cs.id
from public.class_sessions cs
where ws.class_session_id is null
  and cs.class_id = ws.class_id
  and cs.session_date = ws.session_date;

update public.teacher_substitution_requests r
set class_session_id = cs.id
from public.class_sessions cs
where r.class_session_id is null
  and cs.class_id = r.class_id
  and cs.session_date = r.session_date;

update public.teacher_payroll_details d
set class_session_id = cs.id
from public.class_sessions cs
where d.class_session_id is null
  and d.attendance_date is not null
  and cs.class_id = d.class_id
  and cs.session_date = d.attendance_date;

update public.teacher_payroll_details d
set teacher_work_session_id = ws.id
from public.teacher_work_sessions ws
where d.teacher_work_session_id is null
  and d.attendance_date is not null
  and coalesce(d.actual_teacher_id, d.teacher_id) is not null
  and ws.class_id = d.class_id
  and ws.session_date = d.attendance_date
  and ws.actual_teacher_id = coalesce(d.actual_teacher_id, d.teacher_id);

alter table public.attendance
  validate constraint attendance_class_session_id_fkey;
alter table public.teacher_attendance
  validate constraint teacher_attendance_class_session_id_fkey;
alter table public.teacher_work_sessions
  validate constraint teacher_work_sessions_class_session_id_fkey;
alter table public.teacher_substitution_requests
  validate constraint teacher_substitution_requests_class_session_id_fkey;
alter table public.teacher_payroll_details
  validate constraint teacher_payroll_details_class_session_id_fkey;
alter table public.teacher_payroll_details
  validate constraint teacher_payroll_details_work_session_id_fkey;

create unique index if not exists teacher_work_sessions_class_session_unique
  on public.teacher_work_sessions (class_session_id)
  where class_session_id is not null;

commit;
