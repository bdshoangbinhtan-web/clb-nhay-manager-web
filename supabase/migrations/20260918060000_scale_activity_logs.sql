-- Scalable, append-only activity history for long-term operational auditing.
begin;

create schema if not exists private;

alter table public.activity_logs
  add column if not exists branch_id uuid,
  add column if not exists business_group text,
  add column if not exists actor_name_snapshot text,
  add column if not exists actor_role_snapshot text;

create or replace function private.activity_log_business_group(
  p_entity_type text
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_entity_type in (
      'tuition', 'tuition_payments', 'tuition_adjustments', 'expenses',
      'other_revenues', 'teacher_payrolls', 'teacher_payroll_details'
    ) then 'finance'
    when p_entity_type in (
      'teachers', 'teacher_attendance', 'teacher_work_sessions',
      'teacher_substitution_requests'
    ) then 'teachers'
    when p_entity_type in ('students', 'trial_students', 'trial_class_leads')
      then 'students'
    when p_entity_type in (
      'classes', 'class_sessions', 'class_students', 'class_teachers',
      'attendance', 'schedules'
    ) then 'classes'
    else 'system'
  end;
$function$;

revoke all on function private.activity_log_business_group(text) from public;

create or replace function private.resolve_activity_log_branch(
  p_entity_type text,
  p_entity_id uuid,
  p_data jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_branch_id uuid;
  v_related_id uuid;
begin
  begin
    v_branch_id := nullif(p_data ->> 'branch_id', '')::uuid;
  exception when invalid_text_representation then
    v_branch_id := null;
  end;

  if v_branch_id is not null then
    return v_branch_id;
  end if;

  if p_entity_type = 'branches' then
    return p_entity_id;
  end if;

  begin
    v_related_id := nullif(p_data ->> 'class_id', '')::uuid;
  exception when invalid_text_representation then
    v_related_id := null;
  end;

  if v_related_id is not null then
    select c.branch_id into v_branch_id
    from public.classes c
    where c.id = v_related_id;

    if v_branch_id is not null then
      return v_branch_id;
    end if;
  end if;

  begin
    v_related_id := nullif(p_data ->> 'student_id', '')::uuid;
  exception when invalid_text_representation then
    v_related_id := null;
  end;

  if v_related_id is not null then
    select s.branch_id into v_branch_id
    from public.students s
    where s.id = v_related_id;

    if v_branch_id is not null then
      return v_branch_id;
    end if;
  end if;

  begin
    v_related_id := nullif(p_data ->> 'tuition_id', '')::uuid;
  exception when invalid_text_representation then
    v_related_id := null;
  end;

  if v_related_id is not null then
    select t.branch_id into v_branch_id
    from public.tuition t
    where t.id = v_related_id;

    if v_branch_id is not null then
      return v_branch_id;
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function private.resolve_activity_log_branch(text, uuid, jsonb)
from public;

-- Permit an idempotent migration rerun. The immutable guards are recreated at
-- the end of this same transaction before any concurrent writer can continue.
drop trigger if exists reject_activity_log_update_delete
on public.activity_logs;

drop trigger if exists reject_activity_log_truncate
on public.activity_logs;

-- Enrich all historical rows once. No log is deleted or rewritten afterwards.
update public.activity_logs l
set
  business_group = private.activity_log_business_group(l.entity_type),
  branch_id = private.resolve_activity_log_branch(
    l.entity_type,
    l.entity_id,
    coalesce(l.new_data, l.old_data, '{}'::jsonb)
  ),
  actor_name_snapshot = (
    select p.full_name from public.profiles p where p.id = l.user_id
  ),
  actor_role_snapshot = (
    select p.role::text from public.profiles p where p.id = l.user_id
  )
where
  l.business_group is null
  or l.actor_name_snapshot is null
  or l.actor_role_snapshot is null
  or l.branch_id is null;

alter table public.activity_logs
  alter column business_group set default 'system',
  alter column business_group set not null;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activity_logs'::regclass
      and conname = 'activity_logs_business_group_check'
  ) then
    alter table public.activity_logs
      add constraint activity_logs_business_group_check
      check (business_group in ('finance', 'teachers', 'students', 'classes', 'system'))
      not valid;
  end if;
end
$constraints$;

alter table public.activity_logs
  validate constraint activity_logs_business_group_check;

create index if not exists activity_logs_created_id_idx
  on public.activity_logs (created_at desc, id desc);

create index if not exists activity_logs_branch_created_idx
  on public.activity_logs (branch_id, created_at desc)
  where branch_id is not null;

create index if not exists activity_logs_user_created_idx
  on public.activity_logs (user_id, created_at desc)
  where user_id is not null;

create index if not exists activity_logs_group_created_idx
  on public.activity_logs (business_group, created_at desc);

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_record_id uuid;
  v_old_data jsonb;
  v_new_data jsonb;
  v_payload jsonb;
  v_actor_name text;
  v_actor_role text;
begin
  if tg_op = 'DELETE' then
    v_record_id := old.id;
    v_old_data := to_jsonb(old);
    v_new_data := null;
  elsif tg_op = 'UPDATE' then
    v_record_id := new.id;
    v_old_data := to_jsonb(old);
    v_new_data := to_jsonb(new);
  else
    v_record_id := new.id;
    v_old_data := null;
    v_new_data := to_jsonb(new);
  end if;

  v_payload := coalesce(v_new_data, v_old_data, '{}'::jsonb);

  select p.full_name, p.role::text
  into v_actor_name, v_actor_role
  from public.profiles p
  where p.id = auth.uid();

  insert into public.activity_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    branch_id,
    business_group,
    actor_name_snapshot,
    actor_role_snapshot
  )
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    v_record_id,
    v_old_data,
    v_new_data,
    private.resolve_activity_log_branch(
      tg_table_name,
      v_record_id,
      v_payload
    ),
    private.activity_log_business_group(tg_table_name),
    v_actor_name,
    v_actor_role
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function public.log_activity() from public;

-- Complete the audit coverage for operational and financial tables introduced
-- after the original audit trigger set was created.
do $audit_triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'other_revenues',
    'teacher_payroll_details',
    'teacher_work_sessions',
    'teacher_substitution_requests',
    'class_sessions',
    'class_students',
    'class_teachers'
  ]
  loop
    if to_regclass('public.' || v_table) is not null
       and not exists (
         select 1
         from pg_trigger t
         where t.tgrelid = to_regclass('public.' || v_table)
           and t.tgname = 'audit_' || v_table
           and not t.tgisinternal
       )
    then
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()',
        'audit_' || v_table,
        v_table
      );
    end if;
  end loop;
end
$audit_triggers$;

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

alter table public.activity_logs enable row level security;

drop policy if exists "Admins can view activity logs"
on public.activity_logs;

create policy "Admins can view activity logs"
on public.activity_logs
for select
to authenticated
using (public.is_admin());

revoke insert, update, delete, truncate
on public.activity_logs
from anon, authenticated;

create or replace function private.reject_activity_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'Nhật ký hoạt động là dữ liệu chỉ đọc và không được sửa hoặc xóa.',
    detail = 'ACTIVITY_LOG_IMMUTABLE';
end;
$function$;

revoke all on function private.reject_activity_log_mutation() from public;

drop trigger if exists reject_activity_log_update_delete
on public.activity_logs;
create trigger reject_activity_log_update_delete
before update or delete on public.activity_logs
for each row
execute function private.reject_activity_log_mutation();

drop trigger if exists reject_activity_log_truncate
on public.activity_logs;
create trigger reject_activity_log_truncate
before truncate on public.activity_logs
for each statement
execute function private.reject_activity_log_mutation();

comment on table public.activity_logs is
  'Append-only long-term activity history. Read through admin RLS/RPC; no automatic retention or purge.';

commit;
