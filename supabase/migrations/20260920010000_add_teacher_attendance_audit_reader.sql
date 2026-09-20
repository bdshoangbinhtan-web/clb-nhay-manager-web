-- Give active Admin/Manager users one narrow, non-financial view of a
-- teacher's attendance and its audit trail. General activity_logs access
-- remains Admin-only.

begin;

do $audit_trigger$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where t.tgrelid = 'public.teacher_attendance'::regclass
      and not t.tgisinternal
      and n.nspname = 'public'
      and p.proname = 'log_activity'
  ) then
    create trigger audit_teacher_attendance
      after insert or update or delete on public.teacher_attendance
      for each row execute function public.log_activity();
  end if;
end
$audit_trigger$;

create or replace function public.get_teacher_attendance_audit(
  p_teacher_id uuid,
  p_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role::text in ('admin', 'manager')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Chỉ Admin hoặc Quản lý đang hoạt động được xem chi tiết chấm công.';
  end if;

  if p_teacher_id is null or p_month is null then
    raise exception using errcode = '22023', message = 'Thiếu giáo viên hoặc tháng cần xem.';
  end if;

  select jsonb_build_object(
    'taught_count', count(*) filter (where ta.status = 'taught'),
    'sessions', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'attendance_id', ta.id,
          'attendance_date', ta.attendance_date,
          'class_name', c.name,
          'status', ta.status,
          'audit', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'action', l.action,
                'created_at', l.created_at,
                'actor_name', l.actor_name_snapshot,
                'actor_role', l.actor_role_snapshot,
                'status', l.new_data ->> 'status'
              ) order by l.created_at, l.id
            )
            from public.activity_logs l
            where l.entity_type = 'teacher_attendance'
              and l.entity_id = ta.id
              and l.action in ('INSERT', 'UPDATE')
          ), '[]'::jsonb)
        ) order by ta.attendance_date desc, c.name, ta.id
      ) filter (where ta.id is not null),
      '[]'::jsonb
    )
  )
  into v_result
  from public.teacher_attendance ta
  left join public.classes c on c.id = ta.class_id
  where ta.teacher_id = p_teacher_id
    and ta.attendance_date >= date_trunc('month', p_month)::date
    and ta.attendance_date < (date_trunc('month', p_month) + interval '1 month')::date;

  return v_result;
end;
$function$;

revoke all on function public.get_teacher_attendance_audit(uuid, date)
from public, anon;

grant execute on function public.get_teacher_attendance_audit(uuid, date)
to authenticated;

comment on function public.get_teacher_attendance_audit(uuid, date) is
  'Narrow non-financial teacher attendance history for active Admin/Manager users; does not grant general activity_logs access.';

commit;
