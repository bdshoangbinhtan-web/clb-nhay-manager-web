begin;

-- Canonical schedule representation used by every attendance path. Historical
-- rows may contain either "CN" or "0" for Sunday, so both normalize to "0".
create or replace function public.normalize_class_schedule_day(p_day text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when upper(btrim(p_day)) in ('CN', '0') then '0'
    when btrim(p_day) in ('2', '3', '4', '5', '6', '7')
      then btrim(p_day)
    else null
  end;
$$;

revoke all on function public.normalize_class_schedule_day(text) from public;

create or replace function public.class_schedule_contains_date(
  p_schedule_days jsonb,
  p_session_date date
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(p_schedule_days) as d(value)
    where public.normalize_class_schedule_day(d.value) =
      case extract(dow from p_session_date)::integer
        when 0 then '0'
        when 1 then '2'
        when 2 then '3'
        when 3 then '4'
        when 4 then '5'
        when 5 then '6'
        when 6 then '7'
      end
  );
$$;

revoke all on function public.class_schedule_contains_date(jsonb, date)
from public;

create or replace function public.class_schedule_day_count(
  p_schedule_days jsonb
)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select count(distinct public.normalize_class_schedule_day(d.value))::integer
  from jsonb_array_elements_text(p_schedule_days) as d(value)
  where public.normalize_class_schedule_day(d.value) is not null;
$$;

revoke all on function public.class_schedule_day_count(jsonb) from public;

-- Teacher self-confirmation. Weekly frequency is metadata only; the amount of
-- every new work session comes from the immutable class-salary snapshot.
create or replace function public.confirm_teacher_work_session(
  p_class_id uuid,
  p_session_date date
)
returns public.teacher_work_sessions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_schedule_days jsonb;
  v_day_count integer;
  v_multiplier numeric;
  v_rate numeric;
  v_class_salary numeric;
  v_today date;
  v_existing public.teacher_work_sessions;
  v_result public.teacher_work_sessions;
begin
  v_teacher_id := private.current_teacher_id();

  if v_teacher_id is null then
    raise exception 'Không xác định được tài khoản giáo viên';
  end if;

  v_today := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

  if p_session_date > v_today then
    raise exception 'Không thể xác nhận buổi dạy cho ngày trong tương lai';
  end if;

  if date_trunc('month', p_session_date) <> date_trunc('month', v_today) then
    raise exception 'Chỉ được xác nhận buổi dạy trong tháng hiện tại';
  end if;

  if public.is_teacher_payroll_locked(v_teacher_id, p_session_date) then
    raise exception using
      errcode = 'P0001',
      message = 'Bảng lương tháng này đã chốt, không thể xác nhận buổi dạy',
      detail = 'TEACHER_PAYROLL_LOCKED';
  end if;

  select to_jsonb(c.schedule_days), c.teacher_salary_per_session
  into v_schedule_days, v_class_salary
  from public.classes c
  where c.id = p_class_id
    and c.status = 'active';

  if v_schedule_days is null
     or jsonb_typeof(v_schedule_days) <> 'array'
  then
    raise exception 'Không tìm thấy lịch học của lớp';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_schedule_days) as d(value)
    where public.normalize_class_schedule_day(d.value) is null
  ) then
    raise exception 'Lịch lớp chứa ngày học không hợp lệ';
  end if;

  v_day_count := public.class_schedule_day_count(v_schedule_days);

  if v_day_count < 1 then
    raise exception 'Lịch lớp phải có ít nhất một ngày học';
  end if;

  if not public.class_schedule_contains_date(v_schedule_days, p_session_date)
  then
    raise exception 'Ngày % không nằm trong lịch học của lớp', p_session_date;
  end if;

  if not exists (
    select 1
    from public.class_teachers ct
    join public.teachers t on t.id = ct.teacher_id
    where ct.class_id = p_class_id
      and ct.teacher_id = v_teacher_id
      and t.status = 'active'
  ) then
    raise exception 'Giáo viên không được phân công đứng lớp này';
  end if;

  -- Retained only for the legacy rate column. It no longer determines new pay.
  select coalesce(t.salary_rate, 0)
  into v_rate
  from public.teachers t
  where t.id = v_teacher_id
    and t.status = 'active';

  if not found then
    raise exception 'Không tìm thấy giáo viên đang hoạt động';
  end if;

  -- New class-priced sessions always represent exactly one taught session.
  -- Weekly frequency must not change the amount or multiplier.
  v_multiplier := 1;

  perform pg_advisory_xact_lock(
    hashtext(
      p_class_id::text || '|' || p_session_date::text || '|' ||
      v_teacher_id::text
    )
  );

  insert into public.teacher_attendance (
    teacher_id, class_id, attendance_date, status, note
  )
  values (
    v_teacher_id, p_class_id, p_session_date, 'taught',
    'Giáo viên xác nhận đã dạy buổi này'
  )
  on conflict (teacher_id, class_id, attendance_date)
  do update set status = 'taught', note = excluded.note;

  select *
  into v_existing
  from public.teacher_work_sessions
  where class_id = p_class_id
    and session_date = p_session_date
    and actual_teacher_id = v_teacher_id
  limit 1;

  -- Idempotency must not rewrite a legacy work session or its historical pay.
  if v_existing.id is not null then
    return v_existing;
  end if;

  if v_class_salary is null or v_class_salary <= 0 then
    raise exception
      'Lớp chưa có mức lương/buổi. Vui lòng cập nhật Lương theo lớp trước khi xác nhận buổi dạy.';
  end if;

  insert into public.teacher_work_sessions (
    class_id, session_date, standing_teacher_id, actual_teacher_id,
    teaching_type, status, duration_multiplier, standing_hourly_rate,
    calculated_amount, substitution_request_id
  )
  values (
    p_class_id, p_session_date, v_teacher_id, v_teacher_id,
    'regular', 'pending', v_multiplier, v_rate, v_class_salary, null
  )
  returning * into v_result;

  return v_result;
end;
$function$;

-- Substitute self-confirmation follows the same class-snapshot rule.
create or replace function public.create_teacher_work_session(
  p_class_id uuid,
  p_session_date date,
  p_standing_teacher_id uuid,
  p_actual_teacher_id uuid,
  p_teaching_type text,
  p_substitution_request_id uuid
)
returns public.teacher_work_sessions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.teacher_work_sessions;
  v_schedule_days jsonb;
  v_day_count integer;
  v_multiplier numeric;
  v_rate numeric;
  v_class_salary numeric;
  v_is_substitute boolean;
  v_approved boolean;
  v_result public.teacher_work_sessions;
begin
  if p_actual_teacher_id <> private.current_teacher_id() then
    raise exception 'Bạn không có quyền xác nhận buổi dạy này';
  end if;

  if public.is_teacher_payroll_locked(p_actual_teacher_id, p_session_date) then
    raise exception using
      errcode = 'P0001',
      message = 'Bảng lương tháng này đã chốt, không thể xác nhận buổi dạy',
      detail = 'TEACHER_PAYROLL_LOCKED';
  end if;

  select to_jsonb(c.schedule_days), c.teacher_salary_per_session
  into v_schedule_days, v_class_salary
  from public.classes c
  where c.id = p_class_id
    and c.status = 'active';

  if v_schedule_days is null
     or jsonb_typeof(v_schedule_days) <> 'array'
  then
    raise exception 'Không tìm thấy lịch học của lớp';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_schedule_days) as d(value)
    where public.normalize_class_schedule_day(d.value) is null
  ) then
    raise exception 'Lịch lớp chứa ngày học không hợp lệ';
  end if;

  v_day_count := public.class_schedule_day_count(v_schedule_days);

  if v_day_count < 1 then
    raise exception 'Lịch lớp phải có ít nhất một ngày học';
  end if;

  if not public.class_schedule_contains_date(v_schedule_days, p_session_date)
  then
    raise exception 'Ngày % không nằm trong lịch học của lớp', p_session_date;
  end if;

  v_is_substitute := (
    p_substitution_request_id is not null
    or p_actual_teacher_id <> p_standing_teacher_id
    or p_teaching_type = 'substitute'
  );

  if v_is_substitute then
    select exists (
      select 1
      from public.teacher_substitution_requests r
      where r.id = p_substitution_request_id
        and r.class_id = p_class_id
        and r.session_date = p_session_date
        and r.standing_teacher_id = p_standing_teacher_id
        and r.substitute_teacher_id = p_actual_teacher_id
        and r.status = 'approved'
    ) into v_approved;

    if not v_approved then
      raise exception 'Buổi dạy thay chưa được Admin duyệt';
    end if;
  else
    if not exists (
      select 1
      from public.class_teachers ct
      join public.teachers t on t.id = ct.teacher_id
      where ct.class_id = p_class_id
        and ct.teacher_id = p_standing_teacher_id
        and t.id = p_actual_teacher_id
        and t.status = 'active'
        and ct.is_primary = true
    ) then
      raise exception 'Giáo viên không được phân công đứng lớp này';
    end if;
  end if;

  select coalesce(t.salary_rate, 0)
  into v_rate
  from public.teachers t
  where t.id = p_standing_teacher_id
    and t.status = 'active';

  if not found then
    raise exception 'Không tìm thấy giáo viên đứng lớp đang hoạt động';
  end if;

  v_multiplier := 1;

  perform pg_advisory_xact_lock(
    hashtext(
      p_class_id::text || '|' || p_session_date::text || '|' ||
      p_actual_teacher_id::text
    )
  );

  select *
  into v_existing
  from public.teacher_work_sessions
  where class_id = p_class_id
    and session_date = p_session_date
    and actual_teacher_id = p_actual_teacher_id
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  if v_class_salary is null or v_class_salary <= 0 then
    raise exception
      'Lớp chưa có mức lương/buổi. Vui lòng cập nhật Lương theo lớp trước khi xác nhận buổi dạy.';
  end if;

  insert into public.teacher_work_sessions (
    class_id, session_date, standing_teacher_id, actual_teacher_id,
    teaching_type, status, duration_multiplier, standing_hourly_rate,
    calculated_amount, substitution_request_id
  )
  values (
    p_class_id, p_session_date, p_standing_teacher_id, p_actual_teacher_id,
    case when v_is_substitute then 'substitute' else 'regular' end,
    'pending', v_multiplier, v_rate, v_class_salary,
    p_substitution_request_id
  )
  returning * into v_result;

  return v_result;
end;
$function$;

-- Admin attendance/backfill path. Existing work sessions remain untouched for
-- salary fields; only a newly inserted row receives the current class snapshot.
create or replace function public.sync_teacher_attendance_to_work_session(
  p_teacher_id uuid,
  p_class_id uuid,
  p_attendance_date date,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_standing_teacher_id uuid;
  v_substitution_request_id uuid;
  v_is_substitute boolean := false;
  v_schedule_days jsonb;
  v_day_count integer;
  v_multiplier numeric;
  v_rate numeric;
  v_class_salary numeric;
  v_today date;
begin
  v_today := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

  if not (public.is_admin() or private.is_manager()) then
    raise exception 'Không có quyền điểm danh giáo viên';
  end if;

  if p_status not in ('taught', 'absent') then
    raise exception 'Trạng thái điểm danh không hợp lệ';
  end if;

  if p_attendance_date > v_today then
    raise exception 'Không thể điểm danh cho ngày trong tương lai';
  end if;

  if date_trunc('month', p_attendance_date) <> date_trunc('month', v_today)
  then
    raise exception 'Chỉ được điểm danh trong tháng hiện tại';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      p_teacher_id::text || '|' || p_class_id::text || '|' ||
      p_attendance_date::text
    )
  );

  if public.is_teacher_payroll_locked(p_teacher_id, p_attendance_date) then
    raise exception using
      errcode = 'P0001',
      message = 'Bảng lương tháng này đã chốt, không thể sửa điểm danh giáo viên',
      detail = 'TEACHER_PAYROLL_LOCKED';
  end if;

  select to_jsonb(c.schedule_days), c.teacher_salary_per_session
  into v_schedule_days, v_class_salary
  from public.classes c
  where c.id = p_class_id
    and c.status = 'active';

  if v_schedule_days is null
     or jsonb_typeof(v_schedule_days) <> 'array'
  then
    raise exception 'Không tìm thấy lịch học của lớp';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_schedule_days) as d(value)
    where public.normalize_class_schedule_day(d.value) is null
  ) then
    raise exception 'Lịch lớp chứa ngày học không hợp lệ';
  end if;

  v_day_count := public.class_schedule_day_count(v_schedule_days);

  if v_day_count < 1 then
    raise exception 'Lịch lớp phải có ít nhất một ngày học';
  end if;

  if not public.class_schedule_contains_date(v_schedule_days, p_attendance_date)
  then
    raise exception 'Ngày % không nằm trong lịch học của lớp',
      p_attendance_date;
  end if;

  select r.id, r.standing_teacher_id
  into v_substitution_request_id, v_standing_teacher_id
  from public.teacher_substitution_requests r
  where r.class_id = p_class_id
    and r.session_date = p_attendance_date
    and r.substitute_teacher_id = p_teacher_id
    and r.status = 'approved'
  order by r.created_at desc
  limit 1;

  if v_substitution_request_id is not null then
    v_is_substitute := true;
  else
    if not exists (
      select 1
      from public.class_teachers ct
      join public.teachers t on t.id = ct.teacher_id
      where ct.class_id = p_class_id
        and ct.teacher_id = p_teacher_id
        and t.status = 'active'
    ) then
      raise exception 'Giáo viên không được phân công trong lớp này';
    end if;

    v_standing_teacher_id := p_teacher_id;
  end if;

  select coalesce(t.salary_rate, 0)
  into v_rate
  from public.teachers t
  where t.id = v_standing_teacher_id
    and t.status = 'active';

  if not found then
    raise exception 'Không tìm thấy giáo viên đứng lớp đang hoạt động';
  end if;

  insert into public.teacher_attendance (
    teacher_id, class_id, attendance_date, status
  )
  values (p_teacher_id, p_class_id, p_attendance_date, p_status)
  on conflict (teacher_id, class_id, attendance_date)
  do update set status = excluded.status;

  if p_status = 'absent' then
    delete from public.teacher_work_sessions
    where class_id = p_class_id
      and session_date = p_attendance_date
      and actual_teacher_id = p_teacher_id;
    return;
  end if;

  -- Never recalculate an existing historical row. In particular, NULL
  -- snapshots continue to identify legacy teacher-rate sessions.
  update public.teacher_work_sessions
  set
    standing_teacher_id = v_standing_teacher_id,
    actual_teacher_id = p_teacher_id,
    teaching_type = case when v_is_substitute then 'substitute' else 'regular' end,
    status = 'pending',
    substitution_request_id = v_substitution_request_id
  where class_id = p_class_id
    and session_date = p_attendance_date
    and actual_teacher_id = p_teacher_id;

  if found then
    return;
  end if;

  if v_class_salary is null or v_class_salary <= 0 then
    raise exception
      'Lớp chưa có mức lương/buổi. Vui lòng cập nhật Lương theo lớp trước khi xác nhận buổi dạy.';
  end if;

  v_multiplier := 1;

  insert into public.teacher_work_sessions (
    class_id, session_date, standing_teacher_id, actual_teacher_id,
    teaching_type, status, duration_multiplier, standing_hourly_rate,
    calculated_amount, substitution_request_id
  )
  values (
    p_class_id, p_attendance_date, v_standing_teacher_id, p_teacher_id,
    case when v_is_substitute then 'substitute' else 'regular' end,
    'pending', v_multiplier, v_rate, v_class_salary,
    v_substitution_request_id
  );
end;
$function$;

comment on function public.sync_teacher_attendance_to_work_session(
  uuid, uuid, date, text
) is
  'Atomically syncs admin attendance and work sessions for any valid class schedule (one or more days), using immutable class salary snapshots for new sessions.';

commit;
