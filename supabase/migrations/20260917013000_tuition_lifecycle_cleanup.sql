create or replace function public.cleanup_unpaid_tuition_internal(
  p_student_id uuid,
  p_class_id uuid default null,
  p_from_month date default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.tuition_adjustments ta
  using public.tuition t
  where ta.tuition_id = t.id
    and t.student_id = p_student_id
    and (p_class_id is null or t.class_id = p_class_id)
    and (p_from_month is null or t.billing_month >= p_from_month)
    and coalesce(t.amount_paid, 0) = 0
    and not exists (
      select 1
      from public.tuition_payments tp
      where tp.tuition_id = t.id
    );

  delete from public.tuition t
  where t.student_id = p_student_id
    and (p_class_id is null or t.class_id = p_class_id)
    and (p_from_month is null or t.billing_month >= p_from_month)
    and coalesce(t.amount_paid, 0) = 0
    and not exists (
      select 1
      from public.tuition_payments tp
      where tp.tuition_id = t.id
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all
on function public.cleanup_unpaid_tuition_internal(uuid, uuid, date)
from public, anon, authenticated;


create or replace function public.cleanup_tuition_when_student_inactive()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.status is distinct from new.status
     and new.status = 'inactive'
  then
    perform public.cleanup_unpaid_tuition_internal(
      new.id,
      null,
      null
    );
  end if;

  return new;
end;
$$;

revoke all
on function public.cleanup_tuition_when_student_inactive()
from public, anon, authenticated;

drop trigger if exists
  trg_cleanup_tuition_when_student_inactive
on public.students;

create trigger trg_cleanup_tuition_when_student_inactive
after update of status
on public.students
for each row
execute function public.cleanup_tuition_when_student_inactive();


create or replace function public.cleanup_tuition_when_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_month date :=
    date_trunc(
      'month',
      now() at time zone 'Asia/Ho_Chi_Minh'
    )::date;
begin
  if tg_op = 'DELETE' then
    perform public.cleanup_unpaid_tuition_internal(
      old.student_id,
      old.class_id,
      v_current_month
    );

    return old;
  end if;

  if old.student_id is distinct from new.student_id
     or old.class_id is distinct from new.class_id
     or (
       old.status is distinct from new.status
       and coalesce(new.status, '') <> 'active'
     )
  then
    perform public.cleanup_unpaid_tuition_internal(
      old.student_id,
      old.class_id,
      v_current_month
    );
  end if;

  return new;
end;
$$;

revoke all
on function public.cleanup_tuition_when_membership_changes()
from public, anon, authenticated;

drop trigger if exists
  trg_cleanup_tuition_when_membership_changes
on public.class_students;

create trigger trg_cleanup_tuition_when_membership_changes
after update of status, student_id, class_id
   or delete
on public.class_students
for each row
execute function public.cleanup_tuition_when_membership_changes();
