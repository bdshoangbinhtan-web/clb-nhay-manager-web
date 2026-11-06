-- Angel BK Manager V2: reversible pause / resume accounting, no historical refunds.
-- Existing paid receipts, cash ledger, and pre-pause historical debt are untouched.
-- No data backfill: only future status transitions generate automatic waivers.

alter table public.students
  add column if not exists tuition_paused_on date,
  add column if not exists tuition_resumed_on date;

create or replace function public.stamp_student_tuition_status_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := timezone('Asia/Ho_Chi_Minh', now())::date;
begin
  if old.status = 'active' and new.status <> 'active' then
    new.tuition_paused_on := v_today;
  elsif old.status <> 'active' and new.status = 'active' then
    new.tuition_resumed_on := v_today;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_student_tuition_status_dates on public.students;
create trigger trg_stamp_student_tuition_status_dates
before update of status on public.students
for each row execute function public.stamp_student_tuition_status_dates();

-- Only called by the existing student status trigger, not a public RPC.
create or replace function public.auto_waive_paused_student_month(
  p_student_id uuid,
  p_billing_month date,
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_created integer := 0;
  v_month_end date := (p_billing_month + interval '1 month - 1 day')::date;
begin
  if p_actor is null or p_billing_month < date '2026-10-01' then
    return 0;
  end if;

  for v_class_id in
    select cs.class_id from public.class_students cs
    where cs.student_id=p_student_id and cs.status='active'
      and (cs.start_date is null or cs.start_date <= v_month_end)
      and (cs.end_date is null or cs.end_date >= p_billing_month)
  loop
    -- Never waive a receipt/part-payment/adjustment that has any financial history.
    if exists (
      select 1 from public.tuition t
      where t.student_id=p_student_id and t.class_id=v_class_id
        and t.billing_month=p_billing_month
        and (
          coalesce(t.amount_paid,0)>0
          or exists (select 1 from public.tuition_payments tp where tp.tuition_id=t.id)
          or exists (
            select 1 from public.tuition_adjustments ta
            where ta.tuition_id=t.id or ta.target_tuition_id=t.id
          )
        )
    ) then
      continue;
    end if;

    -- Unpaid, untouched invoices are projections, not receipt history;
    -- remove only this billing period (NEVER earlier months).
    delete from public.tuition t
    where t.student_id=p_student_id and t.class_id=v_class_id
      and t.billing_month=p_billing_month
      and coalesce(t.amount_paid,0)=0
      and not exists (select 1 from public.tuition_payments tp where tp.tuition_id=t.id)
      and not exists (
        select 1 from public.tuition_adjustments ta
        where ta.tuition_id=t.id or ta.target_tuition_id=t.id
      );

    -- Reuse an automatically revoked waiver, never override a manual Admin waiver.
    insert into public.tuition_waivers
      (student_id,class_id,billing_month,reason,waived_by,waived_at,revoked_at,revoked_by)
    values
      (p_student_id,v_class_id,p_billing_month,
       '[AUTO_PAUSE] Tạm ngưng học - không phát sinh học phí',p_actor,now(),null,null)
    on conflict (student_id,class_id,billing_month) do update set
      reason=excluded.reason, waived_by=excluded.waived_by,
      waived_at=now(), revoked_at=null, revoked_by=null
    where left(public.tuition_waivers.reason,12)='[AUTO_PAUSE]';
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.auto_waive_paused_student_month(uuid,date,uuid)
  from public, anon, authenticated;

-- Replaces old trigger that deleted ALL historical unpaid tuition on pause.
create or replace function public.cleanup_tuition_when_student_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('Asia/Ho_Chi_Minh',now())::date;
  v_month date := date_trunc('month', timezone('Asia/Ho_Chi_Minh',now()))::date;
  v_cursor date;
  v_actor uuid := auth.uid();
begin
  if old.status='active' and new.status <> 'active' then
    perform public.auto_waive_paused_student_month(new.id,v_month,v_actor);
  elsif old.status <> 'active' and new.status='active' then
    -- Fill the months that elapsed while paused; don't invent pre-existing history.
    if new.tuition_paused_on is not null then
      v_cursor := greatest(
        date_trunc('month',new.tuition_paused_on)::date,
        date '2026-10-01'
      );
      while v_cursor < v_month loop
        perform public.auto_waive_paused_student_month(new.id,v_cursor,v_actor);
        v_cursor := (v_cursor + interval '1 month')::date;
      end loop;
    end if;

    -- Resume this month: reinstate only automatic waivers.
    update public.tuition_waivers w
       set revoked_at=now(), revoked_by=v_actor
    where w.student_id=new.id and w.billing_month=v_month
      and w.revoked_at is null and left(w.reason,12)='[AUTO_PAUSE]';
  end if;
  return new;
end;
$$;

-- One-shot collection: the actual amount is the final fee, not a partial
-- payment. Any difference from the system suggestion requires explanation.
create or replace function public.collect_tuition_payment_one_shot(
  p_student_id uuid,
  p_class_id uuid,
  p_billing_month date,
  p_actual_amount numeric,
  p_suggested_amount numeric,
  p_payment_method text,
  p_client_request_id uuid,
  p_payment_date date default null,
  p_note text default null,
  p_transfer_account text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_branch_id uuid;
  v_student_status text;
  v_class_branch uuid;
  v_class_status text;
  v_invoice public.tuition%rowtype;
  v_prior_paid numeric := 0;
  v_has_history boolean := false;
  v_remaining numeric;
  v_due numeric;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_period date := date_trunc('month',p_billing_month)::date;
begin
  if v_actor is null then
    raise exception 'Bạn chưa đăng nhập.';
  end if;

  select p.role::text,p.branch_id into v_role,v_branch_id
  from public.profiles p
  where p.id=v_actor and p.is_active=true;
  if v_role not in ('admin','manager') or v_role is null then
    raise exception 'Bạn không có quyền thu học phí.';
  end if;
  if p_student_id is null or p_class_id is null or p_client_request_id is null
     or p_billing_month is null or v_period < date '2026-10-01'
     or p_actual_amount is null or p_actual_amount<=0
     or p_suggested_amount is null or p_suggested_amount<0 then
    raise exception 'Thông tin thu học phí không hợp lệ.';
  end if;

  if abs(p_actual_amount-p_suggested_amount)>0.01
     and coalesce(length(v_note),0)<5 then
    raise exception 'Thu khác mức hệ thống đề xuất: cần ghi chú giải trình ít nhất 5 ký tự.';
  end if;

  -- Lock in the same order as the existing atomic payment function.
  select s.status::text into v_student_status
  from public.students s where s.id=p_student_id for update;
  if v_student_status is distinct from 'active' then
    raise exception 'Học viên đang tạm ngưng, không thu học phí.';
  end if;
  select c.branch_id,c.status into v_class_branch,v_class_status
  from public.classes c where c.id=p_class_id for update;
  if v_class_status is distinct from 'active' then
    raise exception 'Lớp hiện không hoạt động.';
  end if;
  if v_role='manager' and v_branch_id is distinct from v_class_branch then
    raise exception 'Bạn không có quyền thu học phí tại cơ sở này.';
  end if;
  if not exists (
    select 1 from public.class_students cs where cs.student_id=p_student_id
      and cs.class_id=p_class_id and cs.status='active'
  ) then
    raise exception 'Học viên không còn học lớp này.';
  end if;
  if exists (
    select 1 from public.tuition_waivers w
    where w.student_id=p_student_id and w.class_id=p_class_id
      and w.billing_month=v_period and w.revoked_at is null
  ) then
    raise exception 'Kỳ học phí đã được miễn thu, cần kiểm tra trạng thái trước khi thu.';
  end if;

  select * into v_invoice from public.tuition t
  where t.student_id=p_student_id and t.class_id=p_class_id
    and t.billing_month=v_period
  for update;

  -- Retry after a successful response is lost: delegate to existing idempotency.
  if exists (
    select 1 from public.tuition_payments tp
    where tp.client_request_user=v_actor and tp.client_request_id=p_client_request_id
  ) then
    return public.collect_tuition_payment_idempotent_atomic(
      p_student_id,p_class_id,v_period,
      coalesce(v_invoice.amount_due,p_actual_amount),p_actual_amount,
      p_payment_method,p_client_request_id,p_payment_date,v_note,p_transfer_account
    );
  end if;

  if v_invoice.id is not null then
    select coalesce(sum(tp.amount),0) into v_prior_paid
    from public.tuition_payments tp where tp.tuition_id=v_invoice.id;

    v_has_history :=
      coalesce(v_invoice.amount_paid,0)>0 or v_prior_paid>0 or exists (
        select 1 from public.tuition_adjustments ta
        where ta.tuition_id=v_invoice.id or ta.target_tuition_id=v_invoice.id
      );

    v_remaining := greatest(v_invoice.amount_due - greatest(
      coalesce(v_invoice.amount_paid,0),v_prior_paid
    ),0);

    if v_has_history then
      -- Never reprice an invoice with a real payment/adjustment.
      if abs(p_actual_amount-v_remaining)>0.01 or v_remaining<=0 then
        raise exception 'Kỳ có lịch sử thu: chỉ được thu hết số còn lại; không điều chỉnh khoản cũ.';
      end if;
      v_due:=v_invoice.amount_due;
    else
      if abs(v_invoice.amount_due-p_actual_amount)>0.01 then
        update public.tuition
        set amount_due=p_actual_amount,
            note=concat_ws(E'\n',nullif(note,''),
              format('Điều chỉnh trước thu: %s -> %s (hệ thống đề xuất %s). %s',
                v_invoice.amount_due,p_actual_amount,p_suggested_amount,
                coalesce(v_note,'Đổi mức do tính lại ngày học')))
        where id=v_invoice.id;
      end if;
      v_due:=p_actual_amount;
    end if;
  else
    v_due:=p_actual_amount;
  end if;

  return public.collect_tuition_payment_idempotent_atomic(
    p_student_id,p_class_id,v_period,v_due,p_actual_amount,
    p_payment_method,p_client_request_id,p_payment_date,v_note,p_transfer_account
  );
end;
$$;

revoke all on function public.collect_tuition_payment_one_shot(uuid,uuid,date,numeric,numeric,text,uuid,date,text,text)
  from public, anon;
grant execute on function public.collect_tuition_payment_one_shot(uuid,uuid,date,numeric,numeric,text,uuid,date,text,text)
  to authenticated;
