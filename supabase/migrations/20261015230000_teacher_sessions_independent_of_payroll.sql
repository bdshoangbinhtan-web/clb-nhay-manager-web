-- Teacher-visible teaching history is independent of payroll creation/locking.
-- All attendance rows are scoped to auth.uid() inside SECURITY DEFINER.
create or replace function public.get_my_teacher_sessions(p_month date)
returns table (
  attendance_id uuid,
  class_id uuid,
  class_name text,
  attendance_date date,
  teaching_type text,
  standing_teacher_name text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    ta.id,
    ta.class_id,
    c.name,
    ta.attendance_date,
    case
      when ws.teaching_type = 'substitute' or sr.id is not null
        then 'substitute'::text
      else 'regular'::text
    end,
    case
      when ws.teaching_type = 'substitute' or sr.id is not null
        then st.full_name
      else null::text
    end
  from public.teachers t
  join public.teacher_attendance ta
    on ta.teacher_id = t.id
   and ta.status = 'taught'
  left join public.classes c on c.id = ta.class_id
  left join lateral (
    select w.teaching_type, w.standing_teacher_id
    from public.teacher_work_sessions w
    where w.actual_teacher_id = ta.teacher_id
      and w.class_id = ta.class_id
      and w.session_date = ta.attendance_date
    order by w.created_at desc, w.id
    limit 1
  ) ws on true
  left join lateral (
    select r.id, r.standing_teacher_id
    from public.teacher_substitution_requests r
    where r.substitute_teacher_id = ta.teacher_id
      and r.class_id = ta.class_id
      and r.session_date = ta.attendance_date
      and r.status = 'approved'
    order by r.created_at desc, r.id
    limit 1
  ) sr on true
  left join public.teachers st
    on st.id = coalesce(ws.standing_teacher_id, sr.standing_teacher_id)
  where t.profile_id = (select auth.uid())
    and t.status = 'active'
    and ta.attendance_date >= date_trunc('month', p_month)::date
    and ta.attendance_date < (date_trunc('month', p_month) + interval '1 month')::date
  order by ta.attendance_date desc, c.name, ta.id;
$function$;

revoke all on function public.get_my_teacher_sessions(date) from public, anon;
grant execute on function public.get_my_teacher_sessions(date) to authenticated;

-- Mask monetary columns on the server until payroll is locked/paid.
-- Return signature stays unchanged for existing clients.
create or replace function public.get_my_teacher_salary(p_payroll_month date)
returns table (
  teacher_id uuid,
  teacher_name text,
  payroll_id uuid,
  payroll_status text,
  total_sessions integer,
  total_amount numeric,
  detail_id uuid,
  class_id uuid,
  class_name text,
  attendance_date date,
  teaching_type text,
  standing_teacher_id uuid,
  standing_teacher_name text,
  salary_rate numeric,
  duration_multiplier numeric,
  calculated_amount numeric,
  actual_amount numeric,
  amount_override boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    t.id,
    t.full_name,
    p.id,
    p.status,
    p.total_sessions,
    case when p.status in ('locked','paid') then p.total_amount else null::numeric end,
    d.id,
    d.class_id,
    c.name,
    d.attendance_date,
    case when d.is_substitute then 'substitute'::text else 'regular'::text end,
    coalesce(d.standing_teacher_id, t.id),
    coalesce(st.full_name, t.full_name),
    case when p.status in ('locked','paid') then d.salary_rate else null::numeric end,
    case when p.status in ('locked','paid') then d.duration_multiplier else null::numeric end,
    case when p.status in ('locked','paid') then d.calculated_amount else null::numeric end,
    case when p.status in ('locked','paid') then d.amount else null::numeric end,
    case when p.status in ('locked','paid') then d.amount_override else null::boolean end
  from public.teachers t
  left join public.teacher_payrolls p
    on p.teacher_id = t.id and p.payroll_month = p_payroll_month
  left join public.teacher_payroll_details d on d.payroll_id = p.id
  left join public.classes c on c.id = d.class_id
  left join public.teachers st on st.id = d.standing_teacher_id
  where t.profile_id = (select auth.uid())
    and t.status = 'active'
  order by d.attendance_date desc nulls last, c.name;
$function$;

revoke all on function public.get_my_teacher_salary(date) from public, anon;
grant execute on function public.get_my_teacher_salary(date) to authenticated;
