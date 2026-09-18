-- Human-facing student codes. UUID students.id remains the primary/foreign key.
begin;

alter table public.students
  add column if not exists student_code text;

-- PostgreSQL unique indexes allow multiple NULL values, so uniqueness can be
-- enforced while the new column is still nullable during the backfill.
create unique index if not exists students_student_code_key
  on public.students (student_code);

create sequence if not exists public.student_code_seq
  as bigint
  minvalue 1
  maxvalue 999999
  start with 1
  increment by 1
  no cycle;

alter sequence public.student_code_seq
  minvalue 1
  maxvalue 999999
  increment by 1
  no cycle;

create or replace function public.assign_student_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Always assign in the database; client-supplied codes are ignored.
  new.student_code := 'HV' || lpad(nextval('public.student_code_seq')::text, 6, '0');

  return new;
end;
$$;

drop trigger if exists students_assign_student_code on public.students;
create trigger students_assign_student_code
before insert on public.students
for each row
execute function public.assign_student_code();

-- Existing students receive deterministic codes. DDL locks the table until commit,
-- so inserts cannot interleave with this backfill.
with ordered_students as (
  select
    id,
    row_number() over (order by created_at asc nulls last, id asc) as code_number
  from public.students
  where student_code is null
), current_codes as (
  select coalesce(
    max(substring(student_code from 3)::bigint),
    0
  ) as max_code
  from public.students
  where student_code ~ '^HV[0-9]+$'
)
update public.students as student
set student_code = 'HV' || lpad(
  (current_codes.max_code + ordered_students.code_number)::text,
  6,
  '0'
)
from ordered_students, current_codes
where student.id = ordered_students.id;

do $$
declare
  v_max_code bigint;
  v_sequence_value bigint;
  v_sequence_called boolean;
  v_missing_count bigint;
  v_duplicate_count bigint;
begin
  select coalesce(max(substring(student_code from 3)::bigint), 0)
  into v_max_code
  from public.students
  where student_code ~ '^HV[0-9]+$';

  select last_value, is_called
  into v_sequence_value, v_sequence_called
  from public.student_code_seq;

  if v_max_code = 0 and not v_sequence_called then
    perform setval('public.student_code_seq', 1, false);
  else
    perform setval(
      'public.student_code_seq',
      greatest(
        v_max_code,
        case when v_sequence_called then v_sequence_value else 0 end,
        1
      ),
      true
    );
  end if;

  select count(*) into v_missing_count
  from public.students
  where student_code is null;

  select count(*) into v_duplicate_count
  from (
    select student_code
    from public.students
    group by student_code
    having count(*) > 1
  ) duplicates;

  if v_missing_count > 0 or v_duplicate_count > 0 then
    raise exception
      'student_code validation failed: % missing, % duplicate groups',
      v_missing_count,
      v_duplicate_count;
  end if;
end;
$$;

alter table public.students
  alter column student_code set not null;

alter table public.students
  drop constraint if exists students_student_code_format_check;

alter table public.students
  add constraint students_student_code_format_check
  check (student_code ~ '^HV[0-9]{6,}$');

create or replace function public.prevent_student_code_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.student_code is distinct from old.student_code then
    raise exception 'student_code cannot be changed once assigned';
  end if;

  return new;
end;
$$;

drop trigger if exists students_prevent_student_code_change on public.students;
create trigger students_prevent_student_code_change
before update of student_code on public.students
for each row
execute function public.prevent_student_code_change();

comment on column public.students.student_code is
  'Immutable human-facing identifier. Internal relationships continue to use students.id.';

-- Keep the original roster RPC intact for compatibility. The v2 result only adds
-- the display code; saving attendance still uses the UUID student_id.
create or replace function public.get_teacher_student_attendance_roster_v2(
  p_class_id uuid,
  p_attendance_date date
)
returns table (
  student_id uuid,
  student_code text,
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
    s.student_code,
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

comment on function public.get_teacher_student_attendance_roster_v2(uuid, date) is
  'Authorized teacher roster with human-facing student codes; student_id remains the UUID relationship key.';

revoke all on function public.get_teacher_student_attendance_roster_v2(uuid, date) from public;
grant execute on function public.get_teacher_student_attendance_roster_v2(uuid, date) to authenticated;

commit;
