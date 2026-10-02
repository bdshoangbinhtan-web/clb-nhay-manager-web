begin;

-- H/A/S/V are metadata on existing transfer sources. They never create
-- separate cash accounts or ledger rows.
alter table public.tuition_payments add column if not exists transfer_account text;
alter table public.expenses add column if not exists transfer_account text;
alter table public.other_revenues add column if not exists transfer_account text;
alter table public.teacher_payrolls add column if not exists transfer_account text;

update public.tuition_payments set transfer_account = 'H'
where payment_method = 'transfer' and transfer_account is null;
update public.expenses set transfer_account = 'H'
where payment_method = 'transfer' and transfer_account is null;
update public.other_revenues set transfer_account = 'H'
where payment_method = 'transfer' and transfer_account is null;
update public.teacher_payrolls set transfer_account = 'H'
where payment_method = 'transfer' and transfer_account is null;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'tuition_payments_transfer_account_check' and conrelid = 'public.tuition_payments'::regclass) then
    alter table public.tuition_payments add constraint tuition_payments_transfer_account_check
      check ((payment_method is distinct from 'cash' or transfer_account is null)
        and (payment_method is distinct from 'transfer' or transfer_account in ('H','A','S','V'))
        and (transfer_account is null or (payment_method = 'transfer' and transfer_account in ('H','A','S','V')) is true)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_transfer_account_check' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_transfer_account_check
      check ((payment_method is distinct from 'cash' or transfer_account is null)
        and (payment_method is distinct from 'transfer' or transfer_account in ('H','A','S','V'))
        and (transfer_account is null or (payment_method = 'transfer' and transfer_account in ('H','A','S','V')) is true)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'other_revenues_transfer_account_check' and conrelid = 'public.other_revenues'::regclass) then
    alter table public.other_revenues add constraint other_revenues_transfer_account_check
      check ((payment_method is distinct from 'cash' or transfer_account is null)
        and (payment_method is distinct from 'transfer' or transfer_account in ('H','A','S','V'))
        and (transfer_account is null or (payment_method = 'transfer' and transfer_account in ('H','A','S','V')) is true)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teacher_payrolls_transfer_account_check' and conrelid = 'public.teacher_payrolls'::regclass) then
    alter table public.teacher_payrolls add constraint teacher_payrolls_transfer_account_check
      check ((payment_method is distinct from 'cash' or transfer_account is null)
        and (payment_method is distinct from 'transfer' or transfer_account in ('H','A','S','V'))
        and (transfer_account is null or (payment_method = 'transfer' and transfer_account in ('H','A','S','V')) is true)) not valid;
  end if;
end;
$constraints$;

alter table public.tuition_payments validate constraint tuition_payments_transfer_account_check;
alter table public.expenses validate constraint expenses_transfer_account_check;
alter table public.other_revenues validate constraint other_revenues_transfer_account_check;
alter table public.teacher_payrolls validate constraint teacher_payrolls_transfer_account_check;

create or replace function private.finance_set_transfer_account()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_method text := lower(nullif(btrim(coalesce(new.payment_method, '')), ''));
  v_transfer_account text := upper(nullif(btrim(coalesce(new.transfer_account, '')), ''));
  v_requested_account text := upper(nullif(current_setting('finance.transfer_account', true), ''));
begin
  if v_method = 'cash' then
    new.transfer_account := null;
  elsif v_method = 'transfer' then
    v_transfer_account := coalesce(v_transfer_account, v_requested_account, 'H');
    if v_transfer_account not in ('H','A','S','V') then
      raise exception 'Hãy chọn tài khoản chuyển khoản H, A, S hoặc V.';
    end if;
    new.transfer_account := v_transfer_account;
  elsif v_transfer_account is not null then
    raise exception 'Chỉ chuyển khoản mới được phân loại H, A, S hoặc V.';
  end if;
  return new;
end;
$function$;
revoke all on function private.finance_set_transfer_account() from public, anon, authenticated;

drop trigger if exists finance_set_transfer_account on public.tuition_payments;
create trigger finance_set_transfer_account before insert or update of payment_method, transfer_account on public.tuition_payments
for each row execute function private.finance_set_transfer_account();
drop trigger if exists finance_set_transfer_account on public.expenses;
create trigger finance_set_transfer_account before insert or update of payment_method, transfer_account on public.expenses
for each row execute function private.finance_set_transfer_account();
drop trigger if exists finance_set_transfer_account on public.other_revenues;
create trigger finance_set_transfer_account before insert or update of payment_method, transfer_account on public.other_revenues
for each row execute function private.finance_set_transfer_account();
drop trigger if exists finance_set_transfer_account on public.teacher_payrolls;
create trigger finance_set_transfer_account before insert or update of payment_method, transfer_account on public.teacher_payrolls
for each row execute function private.finance_set_transfer_account();

create or replace function private.finance_post_tuition_payment()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_branch uuid;
  v_method text;
  v_account uuid;
  v_tuition record;
  v_student_name text;
  v_class_name text;
  v_transfer_account text;
  v_metadata jsonb;
begin
  select t.branch_id, t.student_id, t.class_id, t.billing_month
    into v_tuition from public.tuition t where t.id = new.tuition_id;
  if not found then raise exception 'Không tìm thấy kỳ học phí cho giao dịch.'; end if;
  v_branch := v_tuition.branch_id;
  perform private.finance_require_actor(v_branch, false);
  v_method := lower(coalesce(nullif(new.payment_method, ''), nullif(new.method, ''), ''));
  v_account := private.finance_resolve_account(v_method, v_branch);
  select s.full_name,c.name into v_student_name,v_class_name
    from public.students s left join public.classes c on c.id=v_tuition.class_id
    where s.id=v_tuition.student_id;
  v_transfer_account := case when v_method='transfer' then coalesce(new.transfer_account, 'H') else null end;
  v_metadata := jsonb_build_object('tuition_id',new.tuition_id,'student_id',v_tuition.student_id,
    'student_name',v_student_name,'class_id',v_tuition.class_id,'class_name',v_class_name,
    'payment_method',v_method) || case when v_transfer_account is not null
      then jsonb_build_object('transfer_account',v_transfer_account) else '{}'::jsonb end;
  perform private.finance_insert_ledger(new.payment_date,v_account,'in',new.amount,'tuition',
    'Thu học phí · ' || coalesce(v_student_name,'Học viên') || ' · ' || coalesce(v_class_name,'Lớp') || ' · ' || to_char(v_tuition.billing_month,'MM/YYYY'),
    v_branch,'tuition_payment',new.id,v_metadata);
  return new;
end;
$function$;
revoke all on function private.finance_post_tuition_payment() from public, anon, authenticated;

create or replace function private.finance_post_other_revenue()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_method text := lower(coalesce(new.payment_method, ''));
  v_account uuid;
  v_metadata jsonb;
begin
  perform private.finance_require_actor(new.branch_id, true);
  v_account := private.finance_resolve_account(v_method, new.branch_id);
  v_metadata := jsonb_build_object('payer_name',new.payer_name,'payment_method',v_method,'note',new.note)
    || case when v_method='transfer' then jsonb_build_object('transfer_account',coalesce(new.transfer_account,'H')) else '{}'::jsonb end;
  perform private.finance_insert_ledger(new.revenue_date,v_account,'in',new.amount,new.category,new.description,
    new.branch_id,'other_revenue',new.id,v_metadata);
  return new;
end;
$function$;
revoke all on function private.finance_post_other_revenue() from public, anon, authenticated;

-- Preserve both existing tuition RPC signatures and add overloads that carry
-- the classification through the current atomic/idempotent transaction path.
create or replace function public.collect_tuition_payment_atomic(
  p_student_id uuid, p_class_id uuid, p_billing_month date, p_amount_due numeric,
  p_amount numeric, p_payment_method text, p_payment_date date, p_note text,
  p_transfer_account text
)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_method text := lower(coalesce(p_payment_method, ''));
  v_transfer_account text := upper(nullif(btrim(coalesce(p_transfer_account, '')), ''));
  v_result jsonb;
begin
  if v_method = 'cash' and v_transfer_account is not null then
    raise exception 'Tiền mặt không có tài khoản chuyển khoản.';
  elsif v_method = 'transfer' and (v_transfer_account is null or v_transfer_account not in ('H','A','S','V')) then
    raise exception 'Chuyển khoản phải chọn H, A, S hoặc V.';
  elsif v_method not in ('cash','transfer') then
    raise exception 'Phương thức thanh toán không hợp lệ.';
  end if;
  perform set_config('finance.transfer_account', coalesce(v_transfer_account, ''), true);
  v_result := public.collect_tuition_payment_atomic(p_student_id,p_class_id,p_billing_month,
    p_amount_due,p_amount,p_payment_method,p_payment_date,p_note);
  return v_result;
end;
$function$;
revoke all on function public.collect_tuition_payment_atomic(uuid,uuid,date,numeric,numeric,text,date,text,text) from public,anon;
grant execute on function public.collect_tuition_payment_atomic(uuid,uuid,date,numeric,numeric,text,date,text,text) to authenticated;

create or replace function public.collect_tuition_payment_idempotent_atomic(
  p_student_id uuid, p_class_id uuid, p_billing_month date, p_amount_due numeric,
  p_amount numeric, p_payment_method text, p_client_request_id uuid,
  p_payment_date date, p_note text, p_transfer_account text
)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_method text := lower(coalesce(p_payment_method, ''));
  v_transfer_account text := upper(nullif(btrim(coalesce(p_transfer_account, '')), ''));
  v_existing_account text;
  v_result jsonb;
begin
  if v_method = 'cash' and v_transfer_account is not null then
    raise exception 'Tiền mặt không có tài khoản chuyển khoản.';
  elsif v_method = 'transfer' and (v_transfer_account is null or v_transfer_account not in ('H','A','S','V')) then
    raise exception 'Chuyển khoản phải chọn H, A, S hoặc V.';
  elsif v_method not in ('cash','transfer') then
    raise exception 'Phương thức thanh toán không hợp lệ.';
  end if;
  select tp.transfer_account into v_existing_account from public.tuition_payments tp
    where tp.client_request_user=auth.uid() and tp.client_request_id=p_client_request_id;
  if found and v_method='transfer' and coalesce(v_existing_account,'H') is distinct from v_transfer_account then
    raise exception 'Mã yêu cầu thu đã được dùng cho tài khoản chuyển khoản khác.';
  end if;
  perform set_config('finance.transfer_account', coalesce(v_transfer_account, ''), true);
  v_result := public.collect_tuition_payment_idempotent_atomic(
    p_student_id,p_class_id,p_billing_month,p_amount_due,p_amount,p_payment_method,
    p_client_request_id,p_payment_date,p_note);
  return v_result;
end;
$function$;
revoke all on function public.collect_tuition_payment_idempotent_atomic(uuid,uuid,date,numeric,numeric,text,uuid,date,text,text) from public,anon;
grant execute on function public.collect_tuition_payment_idempotent_atomic(uuid,uuid,date,numeric,numeric,text,uuid,date,text,text) to authenticated;

create or replace function private.finance_post_expense()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  v_method text := lower(nullif(btrim(coalesce(new.payment_method, '')), ''));
  v_account uuid;
  v_payroll_id_text text;
  v_is_payroll_expense boolean := false;
  v_business_date date;
  v_metadata jsonb;
begin
  if v_method is null then
    if new.category = 'salary' and coalesce(new.description, '') like 'Chi lương giáo viên - %'
       and lower(coalesce(new.note, '')) like '%phương thức: chuyển khoản%' then
      v_method := 'transfer';
    elsif new.category = 'salary' and coalesce(new.description, '') like 'Chi lương giáo viên - %'
       and lower(coalesce(new.note, '')) like '%phương thức: tiền mặt%' then
      v_method := 'cash';
    elsif new.category = 'salary' and coalesce(new.description, '') like 'Phụ cấp giáo viên - %'
       and lower(coalesce(new.note, '')) like '%phương thức: chuyển khoản%' then
      v_method := 'transfer';
    elsif new.category = 'salary' and coalesce(new.description, '') like 'Phụ cấp giáo viên - %'
       and lower(coalesce(new.note, '')) like '%phương thức: tiền mặt%' then
      v_method := 'cash';
    end if;
  end if;
  if v_method is null or v_method not in ('cash', 'transfer', 'unclassified') then
    raise exception 'Hãy chọn tài khoản tiền mặt hoặc chuyển khoản.';
  end if;
  perform private.finance_require_actor(new.branch_id, true);
  v_account := private.finance_resolve_account(v_method, new.branch_id);
  if new.category = 'salary'
     and (coalesce(new.description, '') like 'Chi lương giáo viên - %'
       or coalesce(new.description, '') like 'Phụ cấp giáo viên - %') then
    v_payroll_id_text := substring(coalesce(new.note, '') from
      '^Tự động từ bảng lương #([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})');
    if v_payroll_id_text is not null then
      select exists (select 1 from public.teacher_payrolls p
        where lower(p.id::text) = lower(v_payroll_id_text)) into v_is_payroll_expense;
    end if;
  end if;
  v_business_date := case when v_is_payroll_expense
    then (pg_catalog.clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
    else new.expense_date end;
  v_metadata := jsonb_build_object('payment_method', v_method, 'note', new.note)
    || case when v_method='transfer' then jsonb_build_object('transfer_account',coalesce(new.transfer_account,'H')) else '{}'::jsonb end;
  perform private.finance_insert_ledger(v_business_date,v_account,'out',new.amount,new.category,
    coalesce(new.description,new.category),new.branch_id,'expense',new.id,v_metadata);
  return new;
end;
$function$;
revoke all on function private.finance_post_expense() from public, anon, authenticated;
create or replace function public.pay_teacher_payroll_with_allowance(
  p_payroll_id uuid,
  p_payment_method text,
  p_transfer_account text
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_method text := lower(coalesce(p_payment_method, 'cash'));
  v_transfer_account text := upper(nullif(btrim(coalesce(p_transfer_account, '')), ''));
begin
  if v_method not in ('cash', 'transfer', 'unclassified') then
    raise exception 'Phương thức thanh toán không hợp lệ.';
  end if;
  if v_method = 'cash' and v_transfer_account is not null then
    raise exception 'Tiền mặt không có tài khoản chuyển khoản.';
  elsif v_method = 'transfer' and (v_transfer_account is null or v_transfer_account not in ('H','A','S','V')) then
    raise exception 'Chuyển khoản phải chọn H, A, S hoặc V.';
  elsif v_method <> 'transfer' and v_transfer_account is not null then
    raise exception 'Chỉ chuyển khoản mới được phân loại H, A, S hoặc V.';
  end if;

  perform set_config('finance.transfer_account', coalesce(v_transfer_account, ''), true);
  return public.pay_teacher_payroll_with_allowance(p_payroll_id, p_payment_method);
end;
$function$;
revoke all on function public.pay_teacher_payroll_with_allowance(uuid, text, text) from public, anon;
grant execute on function public.pay_teacher_payroll_with_allowance(uuid, text, text) to authenticated;

commit;
