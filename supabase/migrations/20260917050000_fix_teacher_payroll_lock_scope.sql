begin;

-- Refuse to hide or delete unexpected duplicate payroll data. Environments
-- that predate the unique key stop here for manual, lossless reconciliation.
do $$
begin
  if exists (
    select 1
    from public.teacher_payrolls
    group by teacher_id, payroll_month
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Duplicate teacher payroll rows detected.',
      detail = 'DUPLICATE_TEACHER_PAYROLL_PERIOD',
      hint = 'Reconcile duplicate rows without deleting attendance, work sessions, payrolls, or payroll details, then rerun this migration.';
  end if;
end
$$;

-- Add the integrity rule only when an equivalent two-column unique constraint
-- is not already present. Production currently has teacher_payroll_unique.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.teacher_payrolls'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by key_column.ordinality)
        from unnest(c.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = key_column.attnum
      ) = array['teacher_id', 'payroll_month']::name[]
  ) then
    alter table public.teacher_payrolls
      add constraint teacher_payrolls_teacher_month_unique
      unique (teacher_id, payroll_month);
  end if;
end
$$;

create or replace function public.is_teacher_payroll_locked(
  p_teacher_id uuid,
  p_attendance_date date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_payrolls p
    where p.teacher_id = p_teacher_id
      and p.payroll_month = date_trunc('month', p_attendance_date)::date
      and p.status in ('locked', 'paid')
  );
$$;

comment on function public.is_teacher_payroll_locked(uuid, date) is
  'True only for the requested teacher and the exact attendance month when payroll is locked or paid.';

revoke all on function public.is_teacher_payroll_locked(uuid, date) from public;

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
  v_day_key text;
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

  if date_trunc('month', p_attendance_date)
     <> date_trunc('month', v_today)
  then
    raise exception 'Chỉ được điểm danh trong tháng hiện tại';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      p_teacher_id::text || '|' ||
      p_class_id::text || '|' ||
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

  if v_class_salary is null or v_class_salary <= 0 then
    raise exception
      'Lớp chưa có mức lương/buổi. Vui lòng cập nhật Lương theo lớp trước khi xác nhận buổi dạy.';
  end if;

  v_day_key := case extract(dow from p_attendance_date)::integer
    when 0 then 'CN'
    when 1 then '2'
    when 2 then '3'
    when 3 then '4'
    when 4 then '5'
    when 5 then '6'
    when 6 then '7'
  end;

  if not exists (
    select 1
    from jsonb_array_elements_text(v_schedule_days) as d(x)
    where upper(trim(d.x)) = upper(v_day_key)
  ) then
    raise exception 'Ngày % không nằm trong lịch học của lớp',
      p_attendance_date;
  end if;

  select count(distinct trim(d.x))
  into v_day_count
  from jsonb_array_elements_text(v_schedule_days) as d(x);

  if v_day_count < 1 then
    raise exception 'Lịch lớp phải có ít nhất một ngày học';
  end if;

  -- Kept only for backward-compatible metadata. The authoritative amount for
  -- new sessions is the per-session class snapshot trigger. One-day classes
  -- such as "cs2 CN 15h-17h Cô Nhung" are therefore valid.
  v_multiplier := case when v_day_count = 2 then 1.5 else 1 end;

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

  select t.salary_rate
  into v_rate
  from public.teachers t
  where t.id = v_standing_teacher_id
    and t.status = 'active';

  if v_rate is null then
    raise exception 'Không tìm thấy mức lương giáo viên đứng lớp';
  end if;

  insert into public.teacher_attendance (
    teacher_id,
    class_id,
    attendance_date,
    status
  )
  values (
    p_teacher_id,
    p_class_id,
    p_attendance_date,
    p_status
  )
  on conflict (teacher_id, class_id, attendance_date)
  do update set status = excluded.status;

  if p_status = 'absent' then
    delete from public.teacher_work_sessions
    where class_id = p_class_id
      and session_date = p_attendance_date
      and actual_teacher_id = p_teacher_id;
    return;
  end if;

  update public.teacher_work_sessions
  set
    standing_teacher_id = v_standing_teacher_id,
    actual_teacher_id = p_teacher_id,
    teaching_type = case
      when v_is_substitute then 'substitute'
      else 'regular'
    end,
    status = 'pending',
    duration_multiplier = v_multiplier,
    standing_hourly_rate = v_rate,
    calculated_amount = case
      when class_salary_per_session_snapshot is not null
        then class_salary_per_session_snapshot
      else v_class_salary
    end,
    substitution_request_id = v_substitution_request_id
  where class_id = p_class_id
    and session_date = p_attendance_date
    and actual_teacher_id = p_teacher_id;

  if found then
    return;
  end if;

  insert into public.teacher_work_sessions (
    class_id,
    session_date,
    standing_teacher_id,
    actual_teacher_id,
    teaching_type,
    status,
    duration_multiplier,
    standing_hourly_rate,
    calculated_amount,
    substitution_request_id
  )
  values (
    p_class_id,
    p_attendance_date,
    v_standing_teacher_id,
    p_teacher_id,
    case when v_is_substitute then 'substitute' else 'regular' end,
    'pending',
    v_multiplier,
    v_rate,
    v_class_salary,
    v_substitution_request_id
  );
end;
$function$;

commit;
