-- Keep the append-only audit trail intact while making the Admin activity feed useful.
-- No activity_logs rows are deleted or modified by this migration.

begin;

create or replace function public.get_activity_log_page(
  p_month date default null,
  p_branch_id uuid default null,
  p_user_id uuid default null,
  p_business_group text default null,
  p_action text default null,
  p_entity_type text default null,
  p_financial_only boolean default false,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 10), 100);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Chỉ Admin được xem lịch sử hoạt động.';
  end if;

  if p_action is not null and p_action not in ('INSERT', 'UPDATE', 'DELETE') then
    raise exception using
      errcode = '22023',
      message = 'Bộ lọc hành động không hợp lệ.';
  end if;

  if p_business_group is not null
     and p_business_group not in ('finance', 'teachers', 'students', 'classes', 'system')
  then
    raise exception using
      errcode = '22023',
      message = 'Nhóm nghiệp vụ không hợp lệ.';
  end if;

  with filtered as materialized (
    select
      l.id,
      l.created_at,
      l.user_id,
      l.action,
      l.entity_type,
      l.entity_id,
      l.old_data,
      l.new_data,
      l.branch_id,
      l.business_group,
      coalesce(l.actor_name_snapshot, p.full_name) as actor_name,
      coalesce(l.actor_role_snapshot, p.role::text) as actor_role,
      b.name as branch_name
    from public.activity_logs l
    left join public.profiles p on p.id = l.user_id
    left join public.branches b on b.id = l.branch_id
    where (p_month is null or (
        l.created_at >= (p_month::timestamp at time zone 'Asia/Ho_Chi_Minh')
        and l.created_at < (
          (p_month + interval '1 month')::timestamp
          at time zone 'Asia/Ho_Chi_Minh'
        )
      ))
      and (p_branch_id is null or l.branch_id = p_branch_id)
      and (p_user_id is null or l.user_id = p_user_id)
      and (
        case
          when p_financial_only then
            l.business_group = 'finance'
            or l.entity_type = 'teacher_work_sessions'
            or (
              l.entity_type = 'teachers'
              and (
                l.old_data -> 'salary_rate' is distinct from l.new_data -> 'salary_rate'
                or l.old_data -> 'allowance' is distinct from l.new_data -> 'allowance'
              )
            )
            or (
              l.entity_type = 'classes'
              and (
                l.old_data -> 'monthly_fee' is distinct from l.new_data -> 'monthly_fee'
                or l.old_data -> 'teacher_salary_per_session'
                  is distinct from l.new_data -> 'teacher_salary_per_session'
              )
            )
          else p_business_group is null or l.business_group = p_business_group
        end
      )
      and (p_action is null or l.action = p_action)
      and (p_entity_type is null or l.entity_type = p_entity_type)
      -- Student attendance remains stored in activity_logs for forensic/audit use,
      -- but is intentionally hidden from the admin activity feed.
      and l.entity_type <> 'attendance'
      -- Ignore updates where only updated_at changed; these are sync/trigger noise.
      and not (
        l.action = 'UPDATE'
        and (coalesce(l.old_data, '{}'::jsonb) - 'updated_at')
          = (coalesce(l.new_data, '{}'::jsonb) - 'updated_at')
      )
      and not (
        l.entity_type = 'tuition'
        and l.action = 'UPDATE'
        and exists (
          select 1
          from public.activity_logs payment_log
          where payment_log.entity_type = 'tuition_payments'
            and payment_log.action = 'INSERT'
            and payment_log.user_id is not distinct from l.user_id
            and payment_log.new_data ->> 'tuition_id' = l.entity_id::text
            and abs(extract(epoch from (
              payment_log.created_at - l.created_at
            ))) <= 3
        )
      )
  ), page_rows as (
    select *
    from filtered
    order by created_at desc, id desc
    limit v_page_size
    offset (v_page - 1) * v_page_size
  ), aggregate_stats as (
    select
      count(*) as total,
      count(*) filter (where action = 'INSERT') as inserts,
      count(*) filter (where action = 'UPDATE') as updates,
      count(*) filter (where action = 'DELETE') as deletes
    from filtered
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc)
      from page_rows r
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'total', s.total,
      'inserts', s.inserts,
      'updates', s.updates,
      'deletes', s.deletes
    ),
    'page', v_page,
    'page_size', v_page_size,
    'has_more', s.total > v_page * v_page_size
  )
  into v_result
  from aggregate_stats s;

  return v_result;
end;
$function$;

revoke all on function public.get_activity_log_page(
  date, uuid, uuid, text, text, text, boolean, integer, integer
) from public, anon;

grant execute on function public.get_activity_log_page(
  date, uuid, uuid, text, text, text, boolean, integer, integer
) to authenticated;

commit;
