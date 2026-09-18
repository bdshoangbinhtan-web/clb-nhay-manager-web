-- Phase 3: backwards-compatible dual-write.
--
-- Existing UI queries and RPC signatures continue to use class_id/date. These
-- triggers resolve exactly one class session, write class_session_id, and stop
-- with CLASS_SESSION_AMBIGUOUS when an old API cannot distinguish two sessions
-- of the same class on the same date.
begin;

create or replace function private.ensure_class_session(
  p_class_id uuid,
  p_session_date date,
  p_scheduled_teacher_id uuid default null,
  p_actual_teacher_id uuid default null,
  p_teaching_type text default null,
  p_status text default 'scheduled',
  p_substitution_request_id uuid default null,
  p_salary_rate_snapshot numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_ids uuid[];
  v_session public.class_sessions%rowtype;
  v_class public.classes%rowtype;
  v_scheduled_teacher_id uuid;
  v_teaching_type text;
  v_salary_snapshot numeric;
begin
  if p_class_id is null or p_session_date is null then
    raise exception using
      errcode = '22023',
      message = 'Thiếu lớp hoặc ngày của buổi học.';
  end if;

  if p_status not in ('scheduled', 'completed') then
    raise exception using
      errcode = '22023',
      message = 'Trạng thái đồng bộ buổi học không hợp lệ.';
  end if;

  if p_teaching_type is not null
     and p_teaching_type not in ('regular', 'substitute', 'makeup', 'extra')
  then
    raise exception using
      errcode = '22023',
      message = 'Loại buổi học không hợp lệ.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_class_id::text || '|' || p_session_date::text)
  );

  if p_substitution_request_id is not null then
    select array_agg(cs.id order by cs.id)
    into v_session_ids
    from public.class_sessions cs
    where cs.substitution_request_id = p_substitution_request_id;
  end if;

  if coalesce(cardinality(v_session_ids), 0) = 0 then
    select array_agg(cs.id order by cs.start_time nulls last, cs.id)
    into v_session_ids
    from public.class_sessions cs
    where cs.class_id = p_class_id
      and cs.session_date = p_session_date;
  end if;

  if coalesce(cardinality(v_session_ids), 0) > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Có nhiều buổi học của cùng lớp trong ngày; thao tác cũ không xác định được đúng buổi.',
      detail = 'CLASS_SESSION_AMBIGUOUS',
      hint = 'Use a class-session-aware RPC and pass class_session_id.';
  end if;

  if coalesce(cardinality(v_session_ids), 0) = 1 then
    select *
    into v_session
    from public.class_sessions cs
    where cs.id = v_session_ids[1]
    for update;

    if v_session.class_id <> p_class_id
       or v_session.session_date <> p_session_date
    then
      raise exception using
        errcode = '23514',
        message = 'Buổi học không khớp lớp hoặc ngày.',
        detail = 'CLASS_SESSION_IDENTITY_MISMATCH';
    end if;

    if v_session.status = 'cancelled' and p_status = 'completed' then
      raise exception using
        errcode = '23514',
        message = 'Buổi học đã hủy, không thể ghi nhận đã dạy.',
        detail = 'CLASS_SESSION_CANCELLED';
    end if;

    if v_session.scheduled_teacher_id is not null
       and p_scheduled_teacher_id is not null
       and v_session.scheduled_teacher_id <> p_scheduled_teacher_id
    then
      raise exception using
        errcode = '23514',
        message = 'Giáo viên dự kiến không khớp buổi học.',
        detail = 'CLASS_SESSION_SCHEDULED_TEACHER_MISMATCH';
    end if;

    if v_session.actual_teacher_id is not null
       and p_actual_teacher_id is not null
       and v_session.actual_teacher_id <> p_actual_teacher_id
    then
      raise exception using
        errcode = '23514',
        message = 'Buổi học đã ghi nhận một giáo viên thực dạy khác.',
        detail = 'CLASS_SESSION_ACTUAL_TEACHER_MISMATCH';
    end if;

    if v_session.substitution_request_id is not null
       and p_substitution_request_id is not null
       and v_session.substitution_request_id <> p_substitution_request_id
    then
      raise exception using
        errcode = '23514',
        message = 'Yêu cầu dạy thay không khớp buổi học.',
        detail = 'CLASS_SESSION_SUBSTITUTION_MISMATCH';
    end if;

    update public.class_sessions
    set
      scheduled_teacher_id = coalesce(
        class_sessions.scheduled_teacher_id,
        p_scheduled_teacher_id
      ),
      actual_teacher_id = case
        when p_status = 'completed'
          then coalesce(class_sessions.actual_teacher_id, p_actual_teacher_id)
        else class_sessions.actual_teacher_id
      end,
      teaching_type = coalesce(p_teaching_type, class_sessions.teaching_type),
      status = case
        when p_status = 'completed' then 'completed'
        else class_sessions.status
      end,
      substitution_request_id = coalesce(
        class_sessions.substitution_request_id,
        p_substitution_request_id
      ),
      salary_rate_snapshot = coalesce(
        class_sessions.salary_rate_snapshot,
        p_salary_rate_snapshot
      ),
      completed_at = case
        when p_status = 'completed'
          then coalesce(class_sessions.completed_at, now())
        else class_sessions.completed_at
      end
    where id = v_session.id;

    return v_session.id;
  end if;

  select *
  into v_class
  from public.classes c
  where c.id = p_class_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Không tìm thấy lớp để tạo buổi học.';
  end if;

  v_scheduled_teacher_id := p_scheduled_teacher_id;

  if v_scheduled_teacher_id is null then
    select ct.teacher_id
    into v_scheduled_teacher_id
    from public.class_teachers ct
    where ct.class_id = p_class_id
      and ct.is_primary = true
    order by ct.teacher_id
    limit 1;
  end if;

  v_teaching_type := coalesce(p_teaching_type, 'regular');
  v_salary_snapshot := coalesce(
    p_salary_rate_snapshot,
    v_class.teacher_salary_per_session
  );

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
    origin_type,
    completed_at
  )
  values (
    p_class_id,
    p_session_date,
    v_class.schedule_start,
    v_class.schedule_end,
    v_class.branch_id,
    v_scheduled_teacher_id,
    case when p_status = 'completed' then p_actual_teacher_id end,
    v_teaching_type,
    p_status,
    p_substitution_request_id,
    v_salary_snapshot,
    'manual',
    case when p_status = 'completed' then now() end
  )
  returning id into v_session.id;

  return v_session.id;
end;
$function$;

revoke all on function private.ensure_class_session(
  uuid, date, uuid, uuid, text, text, uuid, numeric
) from public;

create or replace function private.assert_class_session_identity(
  p_class_session_id uuid,
  p_class_id uuid,
  p_session_date date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.class_sessions cs
    where cs.id = p_class_session_id
      and cs.class_id = p_class_id
      and cs.session_date = p_session_date
  ) then
    raise exception using
      errcode = '23514',
      message = 'class_session_id không khớp lớp hoặc ngày.',
      detail = 'CLASS_SESSION_IDENTITY_MISMATCH';
  end if;
end;
$function$;

revoke all on function private.assert_class_session_identity(uuid, uuid, date)
from public;

create or replace function private.reconcile_class_session(
  p_class_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.class_sessions%rowtype;
  v_actual_teacher_ids uuid[];
  v_actual_teacher_id uuid;
  v_work public.teacher_work_sessions%rowtype;
  v_approved_request public.teacher_substitution_requests%rowtype;
  v_has_student_attendance boolean;
  v_is_completed boolean;
begin
  select *
  into v_session
  from public.class_sessions cs
  where cs.id = p_class_session_id
  for update;

  if not found or v_session.status = 'cancelled' then
    return;
  end if;

  select array_agg(distinct candidates.teacher_id)
  into v_actual_teacher_ids
  from (
    select ws.actual_teacher_id as teacher_id
    from public.teacher_work_sessions ws
    where ws.class_session_id = p_class_session_id

    union all

    select ta.teacher_id
    from public.teacher_attendance ta
    where ta.class_session_id = p_class_session_id
      and ta.status = 'taught'

    union all

    select a.teacher_id
    from public.attendance a
    where a.class_session_id = p_class_session_id
      and a.teacher_id is not null
      and not exists (
        select 1
        from public.teacher_attendance absent
        where absent.class_session_id = p_class_session_id
          and absent.teacher_id = a.teacher_id
          and absent.status = 'absent'
      )
  ) candidates
  where candidates.teacher_id is not null;

  if coalesce(cardinality(v_actual_teacher_ids), 0) > 1 then
    raise exception using
      errcode = '23514',
      message = 'Các bản ghi của buổi học đang có nhiều giáo viên thực dạy khác nhau.',
      detail = 'CLASS_SESSION_ACTUAL_TEACHER_COLLISION';
  end if;

  if coalesce(cardinality(v_actual_teacher_ids), 0) = 1 then
    v_actual_teacher_id := v_actual_teacher_ids[1];
  end if;

  select *
  into v_work
  from public.teacher_work_sessions ws
  where ws.class_session_id = p_class_session_id
  order by ws.created_at desc, ws.id
  limit 1;

  select *
  into v_approved_request
  from public.teacher_substitution_requests r
  where r.class_session_id = p_class_session_id
    and r.status = 'approved'
  order by r.created_at desc, r.id
  limit 1;

  select exists (
    select 1
    from public.attendance a
    where a.class_session_id = p_class_session_id
  ) into v_has_student_attendance;

  v_is_completed := v_actual_teacher_id is not null
    or (
      v_session.origin_type = 'legacy_backfill'
      and v_has_student_attendance
    );

  update public.class_sessions
  set
    scheduled_teacher_id = coalesce(
      v_work.standing_teacher_id,
      v_approved_request.standing_teacher_id,
      class_sessions.scheduled_teacher_id
    ),
    actual_teacher_id = v_actual_teacher_id,
    teaching_type = case
      when v_work.teaching_type = 'substitute'
        or v_work.substitution_request_id is not null
        or v_approved_request.id is not null
      then 'substitute'
      when v_is_completed then 'regular'
      else class_sessions.teaching_type
    end,
    substitution_request_id = coalesce(
      v_work.substitution_request_id,
      v_approved_request.id,
      case
        when class_sessions.status = 'scheduled'
          then class_sessions.substitution_request_id
      end
    ),
    status = case when v_is_completed then 'completed' else 'scheduled' end,
    completed_at = case
      when v_is_completed then coalesce(class_sessions.completed_at, now())
      else null
    end
  where id = p_class_session_id;
end;
$function$;

revoke all on function private.reconcile_class_session(uuid) from public;

create or replace function public.link_attendance_to_class_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.class_session_id is null then
    new.class_session_id := private.ensure_class_session(
      new.class_id,
      new.attendance_date,
      null,
      new.teacher_id,
      null,
      case when new.teacher_id is not null then 'completed' else 'scheduled' end,
      null,
      null
    );
  else
    perform private.assert_class_session_identity(
      new.class_session_id,
      new.class_id,
      new.attendance_date
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.link_attendance_to_class_session() from public;

drop trigger if exists link_attendance_to_class_session
on public.attendance;
create trigger link_attendance_to_class_session
before insert or update of class_id, attendance_date, teacher_id, class_session_id
on public.attendance
for each row
execute function public.link_attendance_to_class_session();

create or replace function public.reconcile_class_session_after_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform private.reconcile_class_session(old.class_session_id);
    return old;
  end if;

  perform private.reconcile_class_session(new.class_session_id);

  if tg_op = 'UPDATE'
     and old.class_session_id is distinct from new.class_session_id
  then
    perform private.reconcile_class_session(old.class_session_id);
  end if;

  return new;
end;
$function$;

revoke all on function public.reconcile_class_session_after_attendance()
from public;

drop trigger if exists reconcile_class_session_after_attendance
on public.attendance;
create trigger reconcile_class_session_after_attendance
after update of class_id, attendance_date, teacher_id, class_session_id
or delete on public.attendance
for each row
execute function public.reconcile_class_session_after_attendance();

create or replace function public.link_teacher_attendance_to_class_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.class_session_id is null then
    new.class_session_id := private.ensure_class_session(
      new.class_id,
      new.attendance_date,
      null,
      case when new.status = 'taught' then new.teacher_id else null end,
      null,
      case when new.status = 'taught' then 'completed' else 'scheduled' end,
      null,
      null
    );
  else
    perform private.assert_class_session_identity(
      new.class_session_id,
      new.class_id,
      new.attendance_date
    );

    if new.status = 'taught' then
      perform private.ensure_class_session(
        new.class_id,
        new.attendance_date,
        null,
        new.teacher_id,
        null,
        'completed',
        null,
        null
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.link_teacher_attendance_to_class_session()
from public;

drop trigger if exists link_teacher_attendance_to_class_session
on public.teacher_attendance;
create trigger link_teacher_attendance_to_class_session
before insert or update of teacher_id, class_id, attendance_date, status,
  class_session_id
on public.teacher_attendance
for each row
execute function public.link_teacher_attendance_to_class_session();

drop trigger if exists reconcile_class_session_after_teacher_attendance
on public.teacher_attendance;
create trigger reconcile_class_session_after_teacher_attendance
after update of teacher_id, class_id, attendance_date, status,
  class_session_id
or delete on public.teacher_attendance
for each row
execute function public.reconcile_class_session_after_attendance();

create or replace function public.link_work_session_to_class_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.class_session_id is null then
    new.class_session_id := private.ensure_class_session(
      new.class_id,
      new.session_date,
      new.standing_teacher_id,
      new.actual_teacher_id,
      new.teaching_type,
      'completed',
      new.substitution_request_id,
      coalesce(
        new.class_salary_per_session_snapshot,
        new.calculated_amount
      )
    );
  else
    perform private.assert_class_session_identity(
      new.class_session_id,
      new.class_id,
      new.session_date
    );

    perform private.ensure_class_session(
      new.class_id,
      new.session_date,
      new.standing_teacher_id,
      new.actual_teacher_id,
      new.teaching_type,
      'completed',
      new.substitution_request_id,
      coalesce(
        new.class_salary_per_session_snapshot,
        new.calculated_amount
      )
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.link_work_session_to_class_session() from public;

drop trigger if exists link_work_session_to_class_session
on public.teacher_work_sessions;
create trigger link_work_session_to_class_session
before insert or update of class_id, session_date, standing_teacher_id,
  actual_teacher_id, teaching_type, substitution_request_id,
  class_salary_per_session_snapshot, calculated_amount, class_session_id
on public.teacher_work_sessions
for each row
execute function public.link_work_session_to_class_session();

create or replace function public.guard_and_reconcile_deleted_work_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_when = 'BEFORE' then
    if exists (
      select 1
      from public.teacher_payroll_details d
      join public.teacher_payrolls p on p.id = d.payroll_id
      where (
          d.teacher_work_session_id = old.id
          or d.class_session_id = old.class_session_id
        )
        and p.status in ('locked', 'paid')
    ) then
      raise exception using
        errcode = '23514',
        message = 'Buổi dạy đã nằm trong bảng lương chốt/đã chi.',
        detail = 'CLASS_SESSION_PAYROLL_LOCKED';
    end if;

    return old;
  end if;

  perform private.reconcile_class_session(old.class_session_id);
  return old;
end;
$function$;

revoke all on function public.guard_and_reconcile_deleted_work_session()
from public;

drop trigger if exists guard_deleted_work_session
on public.teacher_work_sessions;
create trigger guard_deleted_work_session
before delete on public.teacher_work_sessions
for each row
execute function public.guard_and_reconcile_deleted_work_session();

drop trigger if exists reconcile_deleted_work_session
on public.teacher_work_sessions;
create trigger reconcile_deleted_work_session
after delete on public.teacher_work_sessions
for each row
execute function public.guard_and_reconcile_deleted_work_session();

create or replace function public.link_substitution_to_class_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.class_session_id is null then
    new.class_session_id := private.ensure_class_session(
      new.class_id,
      new.session_date,
      new.standing_teacher_id,
      null,
      case when new.status = 'approved' then 'substitute' else null end,
      'scheduled',
      null,
      null
    );
  else
    perform private.assert_class_session_identity(
      new.class_session_id,
      new.class_id,
      new.session_date
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.link_substitution_to_class_session() from public;

drop trigger if exists link_substitution_to_class_session
on public.teacher_substitution_requests;
create trigger link_substitution_to_class_session
before insert or update of class_id, session_date, standing_teacher_id,
  substitute_teacher_id, status, class_session_id
on public.teacher_substitution_requests
for each row
execute function public.link_substitution_to_class_session();

create or replace function public.sync_approved_substitution_to_class_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'approved' then
    if exists (
      select 1
      from public.class_sessions cs
      where cs.id = new.class_session_id
        and cs.substitution_request_id is not null
        and cs.substitution_request_id <> new.id
    ) then
      raise exception using
        errcode = '23514',
        message = 'Buổi học đã có một yêu cầu dạy thay khác được duyệt.',
        detail = 'CLASS_SESSION_SUBSTITUTION_MISMATCH';
    end if;

    if exists (
      select 1
      from public.teacher_work_sessions ws
      where ws.class_session_id = new.class_session_id
        and (
          ws.standing_teacher_id <> new.standing_teacher_id
          or ws.actual_teacher_id <> new.substitute_teacher_id
          or ws.teaching_type <> 'substitute'
          or ws.substitution_request_id is distinct from new.id
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Buổi học đã có dữ liệu dạy không khớp yêu cầu dạy thay.',
        detail = 'CLASS_SESSION_SUBSTITUTION_WORK_MISMATCH';
    end if;

    update public.class_sessions
    set
      scheduled_teacher_id = coalesce(
        class_sessions.scheduled_teacher_id,
        new.standing_teacher_id
      ),
      teaching_type = 'substitute',
      substitution_request_id = new.id
    where id = new.class_session_id;
  elsif tg_op = 'UPDATE'
        and old.status = 'approved'
        and new.status <> 'approved'
        and not exists (
          select 1
          from public.teacher_work_sessions ws
          where ws.substitution_request_id = new.id
        )
  then
    update public.class_sessions
    set
      teaching_type = 'regular',
      substitution_request_id = null
    where id = new.class_session_id
      and substitution_request_id = new.id
      and status = 'scheduled';
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_approved_substitution_to_class_session()
from public;

drop trigger if exists sync_approved_substitution_to_class_session
on public.teacher_substitution_requests;
create trigger sync_approved_substitution_to_class_session
after insert or update of status
on public.teacher_substitution_requests
for each row
execute function public.sync_approved_substitution_to_class_session();

create or replace function public.link_payroll_detail_to_class_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_ids uuid[];
  v_work_ids uuid[];
  v_actual_teacher_id uuid;
begin
  if new.attendance_date is null then
    return new;
  end if;

  if new.class_session_id is null then
    select array_agg(cs.id order by cs.id)
    into v_session_ids
    from public.class_sessions cs
    where cs.class_id = new.class_id
      and cs.session_date = new.attendance_date;

    if coalesce(cardinality(v_session_ids), 0) <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'Không xác định được duy nhất buổi học cho chi tiết lương.',
        detail = case
          when coalesce(cardinality(v_session_ids), 0) = 0
            then 'CLASS_SESSION_MISSING'
          else 'CLASS_SESSION_AMBIGUOUS'
        end;
    end if;

    new.class_session_id := v_session_ids[1];
  else
    perform private.assert_class_session_identity(
      new.class_session_id,
      new.class_id,
      new.attendance_date
    );
  end if;

  v_actual_teacher_id := coalesce(new.actual_teacher_id, new.teacher_id);

  if new.teacher_work_session_id is null and v_actual_teacher_id is not null then
    select array_agg(ws.id order by ws.id)
    into v_work_ids
    from public.teacher_work_sessions ws
    where ws.class_session_id = new.class_session_id
      and ws.actual_teacher_id = v_actual_teacher_id;

    if coalesce(cardinality(v_work_ids), 0) <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'Không xác định được duy nhất buổi dạy cho chi tiết lương.',
        detail = case
          when coalesce(cardinality(v_work_ids), 0) = 0
            then 'TEACHER_WORK_SESSION_MISSING'
          else 'TEACHER_WORK_SESSION_AMBIGUOUS'
        end;
    end if;

    new.teacher_work_session_id := v_work_ids[1];
  end if;

  if new.teacher_work_session_id is not null
     and not exists (
       select 1
       from public.teacher_work_sessions ws
       where ws.id = new.teacher_work_session_id
         and ws.class_session_id = new.class_session_id
         and (
           v_actual_teacher_id is null
           or ws.actual_teacher_id = v_actual_teacher_id
         )
     )
  then
    raise exception using
      errcode = '23514',
      message = 'Buổi dạy không khớp class session hoặc giáo viên của chi tiết lương.',
      detail = 'PAYROLL_WORK_SESSION_MISMATCH';
  end if;

  return new;
end;
$function$;

revoke all on function public.link_payroll_detail_to_class_session()
from public;

drop trigger if exists link_payroll_detail_to_class_session
on public.teacher_payroll_details;
create trigger link_payroll_detail_to_class_session
before insert or update of class_id, attendance_date, teacher_id,
  actual_teacher_id, class_session_id
on public.teacher_payroll_details
for each row
execute function public.link_payroll_detail_to_class_session();

create or replace function public.guard_class_session_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_has_payroll boolean;
  v_has_children boolean;
begin
  select exists (
    select 1
    from public.teacher_payroll_details d
    join public.teacher_payrolls p on p.id = d.payroll_id
    where d.class_session_id = old.id
      and p.status in ('locked', 'paid')
  ) into v_has_payroll;

  select
    exists (select 1 from public.attendance a where a.class_session_id = old.id)
    or exists (
      select 1 from public.teacher_attendance ta
      where ta.class_session_id = old.id
    )
    or exists (
      select 1 from public.teacher_work_sessions ws
      where ws.class_session_id = old.id
    )
    or exists (
      select 1 from public.teacher_substitution_requests r
      where r.class_session_id = old.id
    )
    or exists (
      select 1 from public.teacher_payroll_details d
      where d.class_session_id = old.id
    )
  into v_has_children;

  if v_has_children and (
    new.class_id is distinct from old.class_id
    or new.session_date is distinct from old.session_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.branch_id is distinct from old.branch_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Không được đổi định danh lớp/ngày/giờ của buổi đã có dữ liệu.',
      detail = 'CLASS_SESSION_IDENTITY_IMMUTABLE';
  end if;

  if (old.status = 'completed' or v_has_payroll)
     and new.salary_rate_snapshot is distinct from old.salary_rate_snapshot
  then
    raise exception using
      errcode = '23514',
      message = 'Không được sửa snapshot lương của buổi đã hoàn tất.',
      detail = 'CLASS_SESSION_SALARY_SNAPSHOT_IMMUTABLE';
  end if;

  if v_has_payroll and (
    new.actual_teacher_id is distinct from old.actual_teacher_id
    or new.salary_override is distinct from old.salary_override
    or new.status is distinct from old.status
  ) then
    raise exception using
      errcode = '23514',
      message = 'Buổi học đã nằm trong bảng lương chốt/đã chi.',
      detail = 'CLASS_SESSION_PAYROLL_LOCKED';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_class_session_history() from public;

drop trigger if exists guard_class_session_history
on public.class_sessions;
create trigger guard_class_session_history
before update on public.class_sessions
for each row
execute function public.guard_class_session_history();

-- Close the small live-traffic window between the backfill migration and the
-- trigger installation. CREATE TRIGGER holds table locks until COMMIT, so any
-- writer that resumes after this catch-up will already use dual-write.
update public.teacher_substitution_requests
set
  status = teacher_substitution_requests.status,
  class_session_id = teacher_substitution_requests.class_session_id
where class_session_id is null;

update public.teacher_attendance
set class_session_id = teacher_attendance.class_session_id
where class_session_id is null;

update public.teacher_work_sessions
set class_session_id = teacher_work_sessions.class_session_id
where class_session_id is null;

update public.attendance
set class_session_id = attendance.class_session_id
where class_session_id is null;

update public.teacher_payroll_details
set class_session_id = teacher_payroll_details.class_session_id
where class_session_id is null
  and attendance_date is not null;

do $dual_write_check$
declare
  v_count integer;
begin
  select
    (select count(*) from public.attendance
      where class_session_id is null)
    + (select count(*) from public.teacher_attendance
      where class_session_id is null)
    + (select count(*) from public.teacher_work_sessions
      where class_session_id is null)
    + (select count(*) from public.teacher_substitution_requests
      where class_session_id is null)
    + (select count(*) from public.teacher_payroll_details
      where attendance_date is not null and class_session_id is null)
  into v_count;

  if v_count > 0 then
    raise exception using
      errcode = '23514',
      message = 'Dual-write class session còn bản ghi chưa được liên kết.',
      detail = 'CLASS_SESSION_DUAL_WRITE_GAP:' || v_count::text,
      hint = 'The transaction has been rolled back. Inspect the unlinked legacy rows and retry.';
  end if;
end
$dual_write_check$;

comment on function private.ensure_class_session(
  uuid, date, uuid, uuid, text, text, uuid, numeric
) is
  'Compatibility resolver for legacy class/date write paths. It creates or updates exactly one class session and refuses ambiguous dates.';

commit;
