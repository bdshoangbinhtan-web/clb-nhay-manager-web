-- Legacy inactive students predate the pause date tracker.
-- Treat their unrecorded launch-era gaps as paused when they first resume.
-- Paid invoices/receipt history are never changed by auto_waive_paused_student_month.

create or replace function public.cleanup_tuition_when_student_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month',timezone('Asia/Ho_Chi_Minh',now()))::date;
  v_cursor date;
  v_actor uuid := auth.uid();
begin
  if old.status='active' and new.status <> 'active' then
    perform public.auto_waive_paused_student_month(new.id,v_month,v_actor);
  elsif old.status <> 'active' and new.status='active' then
    -- Old inactive profiles lack a recorded pause date. Begin no earlier than
    -- the tuition tracking launch (10/2026), preserving all paid invoices.
    v_cursor := greatest(
      date_trunc('month',coalesce(new.tuition_paused_on,date '2026-10-01'))::date,
      date '2026-10-01'
    );
    while v_cursor < v_month loop
      perform public.auto_waive_paused_student_month(new.id,v_cursor,v_actor);
      v_cursor := (v_cursor + interval '1 month')::date;
    end loop;

    -- The resume month is chargeable from the return date.
    update public.tuition_waivers w
       set revoked_at=now(), revoked_by=v_actor
    where w.student_id=new.id and w.billing_month=v_month
      and w.revoked_at is null and left(w.reason,12)='[AUTO_PAUSE]';
  end if;
  return new;
end;
$$;
