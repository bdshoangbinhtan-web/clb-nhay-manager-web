begin;

-- Phase 2 cut-over:
-- - Every NEW work session snapshots the class salary at insert time.
-- - Existing rows with a NULL snapshot remain untouched and keep the legacy
--   teacher-hourly calculation.
-- - A captured snapshot is immutable. Admin adjustments still belong in
--   teacher_payroll_details.amount/override_amount, not on the work session.
create or replace function public.apply_class_salary_snapshot_to_work_session()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_class_salary numeric;
begin
  if tg_op = 'INSERT' then
    select c.teacher_salary_per_session
    into v_class_salary
    from public.classes c
    where c.id = new.class_id;

    if v_class_salary is null or v_class_salary <= 0 then
      raise exception
        'Lớp chưa có mức lương/buổi. Vui lòng cập nhật Lương theo lớp trước khi xác nhận buổi dạy.';
    end if;

    -- Ignore any client-supplied value and always take the trusted class rate.
    new.class_salary_per_session_snapshot := v_class_salary;
    new.calculated_amount := v_class_salary;
    return new;
  end if;

  if new.class_salary_per_session_snapshot
     is distinct from old.class_salary_per_session_snapshot
  then
    raise exception 'Không được sửa snapshot lương của buổi dạy đã ghi nhận.';
  end if;

  -- Legacy rows intentionally keep their old calculation. For new rows, stop
  -- older RPCs from replacing the class amount during a later status update.
  if old.class_salary_per_session_snapshot is not null then
    new.calculated_amount := old.class_salary_per_session_snapshot;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_class_salary_snapshot_to_work_session
on public.teacher_work_sessions;

create trigger apply_class_salary_snapshot_to_work_session
before insert or update of class_salary_per_session_snapshot, calculated_amount
on public.teacher_work_sessions
for each row
execute function public.apply_class_salary_snapshot_to_work_session();

comment on function public.apply_class_salary_snapshot_to_work_session() is
  'Snapshots classes.teacher_salary_per_session for new work sessions without backfilling historical sessions.';

-- Keep the public RPC signature and all existing locking/validation behavior.
-- Only the expected amount and saved detail rate switch to the snapshot when
-- one exists. A NULL snapshot uses the exact legacy calculation.
create or replace function public.save_teacher_payroll_atomic(
  p_teacher_id uuid,
  p_payroll_month date,
  p_target_status text,
  p_details jsonb
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_payroll_id uuid;
  v_existing_status text;
  v_teacher_salary numeric;

  v_detail jsonb;
  v_class_id uuid;
  v_attendance_date date;
  v_amount numeric;

  v_work public.teacher_work_sessions%rowtype;
  v_expected_amount numeric;
  v_saved_rate numeric;
  v_saved_multiplier numeric;

  v_total_sessions integer := 0;
  v_total_amount numeric := 0;
  v_is_override boolean;
begin
  if not public.is_admin() then
    raise exception 'Chỉ ADMIN mới được lưu hoặc chốt bảng lương.';
  end if;

  if p_teacher_id is null then
    raise exception 'Thiếu giáo viên.';
  end if;

  if p_payroll_month is null
     or p_payroll_month <> date_trunc('month', p_payroll_month)::date
  then
    raise exception 'Tháng lương không hợp lệ.';
  end if;

  if p_target_status not in ('draft', 'locked') then
    raise exception 'Trạng thái bảng lương không hợp lệ.';
  end if;

  if p_details is null or jsonb_typeof(p_details) <> 'array' then
    raise exception 'Chi tiết bảng lương phải là một mảng.';
  end if;

  if jsonb_array_length(p_details) = 0 then
    raise exception 'Bảng lương chưa có buổi dạy nào.';
  end if;

  select coalesce(t.salary_rate, 0)
  into v_teacher_salary
  from public.teachers t
  where t.id = p_teacher_id
    and t.status = 'active';

  if not found then
    raise exception 'Không tìm thấy giáo viên đang hoạt động.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_teacher_id::text || '|' || p_payroll_month::text)
  );

  select p.id, p.status
  into v_payroll_id, v_existing_status
  from public.teacher_payrolls p
  where p.teacher_id = p_teacher_id
    and p.payroll_month = p_payroll_month
  for update;

  if found then
    if v_existing_status = 'paid' then
      raise exception 'Bảng lương này đã chi, không thể sửa.';
    end if;

    if v_existing_status = 'locked' then
      if p_target_status = 'locked' then
        return jsonb_build_object(
          'success', true,
          'already_locked', true,
          'payroll_id', v_payroll_id,
          'status', 'locked'
        );
      end if;

      raise exception 'Bảng lương này đã chốt, không thể lưu nháp.';
    end if;
  else
    insert into public.teacher_payrolls (
      teacher_id,
      payroll_month,
      total_sessions,
      salary_rate,
      total_amount,
      status
    )
    values (
      p_teacher_id,
      p_payroll_month,
      0,
      v_teacher_salary,
      0,
      'draft'
    )
    returning id into v_payroll_id;
  end if;

  delete from public.teacher_payroll_details
  where payroll_id = v_payroll_id;

  for v_detail in
    select value from jsonb_array_elements(p_details)
  loop
    begin
      v_class_id := nullif(btrim(v_detail ->> 'class_id'), '')::uuid;
      v_attendance_date :=
        nullif(btrim(v_detail ->> 'attendance_date'), '')::date;
      v_amount := nullif(btrim(v_detail ->> 'amount'), '')::numeric;
    exception
      when others then
        raise exception 'Chi tiết bảng lương có dữ liệu không hợp lệ.';
    end;

    if v_class_id is null
       or v_attendance_date is null
       or v_amount is null
    then
      raise exception 'Chi tiết bảng lương thiếu lớp, ngày dạy hoặc số tiền.';
    end if;

    if v_amount < 0 then
      raise exception 'Tiền lương của một buổi không được âm.';
    end if;

    if date_trunc('month', v_attendance_date)::date <> p_payroll_month then
      raise exception
        'Buổi dạy % không thuộc tháng lương %.',
        v_attendance_date,
        p_payroll_month;
    end if;

    select ws.*
    into v_work
    from public.teacher_work_sessions ws
    where ws.class_id = v_class_id
      and ws.session_date = v_attendance_date
      and ws.actual_teacher_id = p_teacher_id
      and exists (
        select 1
        from public.teacher_attendance ta
        where ta.teacher_id = p_teacher_id
          and ta.class_id = v_class_id
          and ta.attendance_date = v_attendance_date
          and ta.status = 'taught'
      );

    if not found then
      raise exception
        'Không tìm thấy buổi dạy đã được xác nhận: lớp %, ngày %.',
        v_class_id,
        v_attendance_date;
    end if;

    if v_work.class_salary_per_session_snapshot is not null then
      v_expected_amount := v_work.class_salary_per_session_snapshot;
      v_saved_rate := v_work.class_salary_per_session_snapshot;
      v_saved_multiplier := 1;
    else
      v_expected_amount := v_work.calculated_amount;
      v_saved_rate := v_work.standing_hourly_rate;
      v_saved_multiplier := v_work.duration_multiplier;
    end if;

    if v_expected_amount is null then
      raise exception
        'Buổi dạy lớp %, ngày % chưa có mức lương hợp lệ.',
        v_class_id,
        v_attendance_date;
    end if;

    v_is_override := abs(v_amount - v_expected_amount) > 0.01;

    insert into public.teacher_payroll_details (
      payroll_id,
      class_id,
      sessions,
      salary_rate,
      amount,
      actual_teacher_id,
      standing_teacher_id,
      hourly_rate,
      calculated_amount,
      override_amount,
      attendance_date,
      teacher_id,
      duration_multiplier,
      is_substitute,
      amount_override
    )
    values (
      v_payroll_id,
      v_class_id,
      1,
      v_saved_rate,
      v_amount,
      p_teacher_id,
      v_work.standing_teacher_id,
      v_work.standing_hourly_rate,
      v_expected_amount,
      case when v_is_override then v_amount else null end,
      v_attendance_date,
      p_teacher_id,
      v_saved_multiplier,
      v_work.teaching_type = 'substitute',
      v_is_override
    );

    v_total_sessions := v_total_sessions + 1;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update public.teacher_payrolls
  set
    total_sessions = v_total_sessions,
    salary_rate = v_teacher_salary,
    total_amount = v_total_amount,
    status = p_target_status,
    updated_at = now()
  where id = v_payroll_id;

  return jsonb_build_object(
    'success', true,
    'already_locked', false,
    'payroll_id', v_payroll_id,
    'status', p_target_status,
    'total_sessions', v_total_sessions,
    'total_amount', v_total_amount
  );
end;
$function$;

commit;
