-- Give an approved substitute teacher access to the attendance roster only for
-- the approved class and session date. The RPC boundary avoids granting
-- permanent SELECT access to classes, students, or class_students.
begin;

create or replace function private.teacher_can_access_class_on_date(
  p_class_id uuid,
  p_attendance_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_class_id is not null
    and p_attendance_date is not null
    and exists (
      select 1
      from public.teachers t
      join public.profiles p on p.id = t.profile_id
      where t.id = private.current_teacher_id()
        and t.status = 'active'
        and p.is_active = true
        and (
          (
            exists (
              select 1
              from public.class_teachers ct
              where ct.class_id = p_class_id
                and ct.teacher_id = t.id
            )
            -- Preserve the existing rule: once Admin assigns a substitute,
            -- the standing teacher must not also edit the same session.
            and not exists (
              select 1
              from public.teacher_substitution_requests r
              where r.class_id = p_class_id
                and r.session_date = p_attendance_date
                and r.standing_teacher_id = t.id
                and r.status = 'approved'
            )
          )
          or exists (
            select 1
            from public.teacher_substitution_requests r
            where r.class_id = p_class_id
              and r.session_date = p_attendance_date
              and r.substitute_teacher_id = t.id
              and r.status = 'approved'
          )
        )
    );
$function$;

comment on function private.teacher_can_access_class_on_date(uuid, date) is
  'True for an active assigned teacher, or an active substitute teacher with an approved request for exactly this class and date.';

create or replace function public.get_teacher_student_attendance_roster(
  p_class_id uuid,
  p_attendance_date date
)
returns table (
  student_id uuid,
  full_name text,
  attendance_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.teacher_can_access_class_on_date(
    p_class_id,
    p_attendance_date
  ) then
    raise exception using
      errcode = '42501',
      message = 'Bạn không có quyền điểm danh lớp này trong ngày đã chọn';
  end if;

  return query
  select
    s.id,
    s.full_name,
    a.status::text
  from public.class_students cs
  join public.students s on s.id = cs.student_id
  left join public.attendance a
    on a.class_id = cs.class_id
   and a.student_id = cs.student_id
   and a.attendance_date = p_attendance_date
  where cs.class_id = p_class_id
    and cs.status = 'active'
    and s.status = 'active'
  order by s.full_name, s.id;
end;
$function$;

comment on function public.get_teacher_student_attendance_roster(uuid, date) is
  'Returns the active student roster and attendance for a teacher authorized for exactly this class/date, including approved substitutes.';

create or replace function public.save_teacher_student_attendance(
  p_class_id uuid,
  p_attendance_date date,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_saved_count integer;
begin
  if not private.teacher_can_access_class_on_date(
    p_class_id,
    p_attendance_date
  ) then
    raise exception using
      errcode = '42501',
      message = 'Bạn không có quyền điểm danh lớp này trong ngày đã chọn';
  end if;

  v_teacher_id := private.current_teacher_id();

  if v_teacher_id is null then
    raise exception using
      errcode = '42501',
      message = 'Không xác định được tài khoản giáo viên';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Dữ liệu điểm danh không hợp lệ';
  end if;

  if exists (
    select input.student_id
    from jsonb_to_recordset(p_rows) as input(student_id uuid, status text)
    group by input.student_id
    having count(*) > 1
  ) then
    raise exception 'Danh sách điểm danh có học viên bị trùng';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as input(student_id uuid, status text)
    where input.student_id is null
       or input.status is null
       or input.status not in ('present', 'absent', 'excused')
  ) then
    raise exception 'Dữ liệu hoặc trạng thái điểm danh không hợp lệ';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as input(student_id uuid, status text)
    where not exists (
      select 1
      from public.class_students cs
      join public.students s on s.id = cs.student_id
      where cs.class_id = p_class_id
        and cs.student_id = input.student_id
        and cs.status = 'active'
        and s.status = 'active'
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Danh sách điểm danh có học viên không thuộc lớp';
  end if;

  insert into public.attendance (
    student_id,
    class_id,
    teacher_id,
    attendance_date,
    status,
    recorded_by,
    recorded_at
  )
  select
    input.student_id,
    p_class_id,
    v_teacher_id,
    p_attendance_date,
    input.status::public.attendance_status,
    auth.uid(),
    now()
  from jsonb_to_recordset(p_rows) as input(student_id uuid, status text)
  on conflict (student_id, class_id, attendance_date)
  do update set
    status = excluded.status,
    teacher_id = excluded.teacher_id,
    recorded_by = excluded.recorded_by,
    recorded_at = excluded.recorded_at;

  get diagnostics v_saved_count = row_count;
  return v_saved_count;
end;
$function$;

comment on function public.save_teacher_student_attendance(uuid, date, jsonb) is
  'Validates class/date access and active membership, then atomically upserts one attendance batch for assigned or approved substitute teachers.';

revoke all on function public.get_teacher_student_attendance_roster(uuid, date)
  from public;
revoke all on function public.save_teacher_student_attendance(uuid, date, jsonb)
  from public;

grant execute on function public.get_teacher_student_attendance_roster(uuid, date)
  to authenticated;
grant execute on function public.save_teacher_student_attendance(uuid, date, jsonb)
  to authenticated;

commit;
