begin;

-- V1 starts a new ledger. Existing finance rows are intentionally not copied.
create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null check (length(trim(account_type)) > 0),
  branch_id uuid references public.branches(id) on delete restrict,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint cash_accounts_name_not_blank check (length(trim(name)) > 0)
);

create unique index cash_accounts_default_global_type_key
  on public.cash_accounts (account_type)
  where branch_id is null and is_default;
create unique index cash_accounts_global_name_key
  on public.cash_accounts (account_type, name)
  where branch_id is null;
create unique index cash_accounts_branch_name_key
  on public.cash_accounts (branch_id, name)
  where branch_id is not null;

insert into public.cash_accounts (name, account_type, is_default)
values ('Tiền mặt', 'cash', true), ('Chuyển khoản / Ngân hàng', 'bank', true)
on conflict do nothing;

create table public.cash_ledger (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  business_date date not null,
  account_id uuid not null references public.cash_accounts(id) on delete restrict,
  direction text not null check (direction in ('in', 'out')),
  amount numeric(14,2) not null check (amount > 0),
  category text not null,
  description text not null,
  branch_id uuid references public.branches(id) on delete restrict,
  source_type text not null,
  source_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  reversal_of uuid references public.cash_ledger(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  constraint cash_ledger_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index cash_ledger_source_account_key
  on public.cash_ledger (source_type, source_id, account_id)
  where source_id is not null;
create unique index cash_ledger_single_source_key
  on public.cash_ledger (source_type, source_id)
  where source_id is not null and source_type in ('tuition_payment','tuition_refund','expense','other_revenue','reversal','opening_balance');
create unique index cash_ledger_one_reversal_key
  on public.cash_ledger (reversal_of)
  where reversal_of is not null;
create index cash_ledger_business_date_idx on public.cash_ledger (business_date desc, occurred_at desc);
create index cash_ledger_account_date_idx on public.cash_ledger (account_id, business_date desc);
create index cash_ledger_branch_date_idx on public.cash_ledger (branch_id, business_date desc);
create index cash_ledger_source_idx on public.cash_ledger (source_type, source_id);
create index cash_ledger_created_at_idx on public.cash_ledger (created_at desc);

-- A source is marked reversed in a separate append-only table. Reports exclude
-- the marked business row while the cash ledger retains both original and reversal.
create table public.finance_source_reversals (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('expense','other_revenue','account_transfer','opening_balance')),
  source_id uuid not null,
  original_ledger_ids uuid[] not null check (cardinality(original_ledger_ids) > 0),
  reversal_ledger_ids uuid[] not null check (cardinality(reversal_ledger_ids) = cardinality(original_ledger_ids)),
  branch_id uuid references public.branches(id) on delete restrict,
  reason text not null check (length(trim(reason)) > 0),
  reversed_by uuid not null references public.profiles(id) on delete restrict,
  reversed_by_name text,
  reversed_at timestamptz not null default now(),
  constraint finance_source_reversals_source_key unique (source_type, source_id)
);
create index finance_source_reversals_branch_idx on public.finance_source_reversals (branch_id, reversed_at desc);

create table public.cash_transfers (
  id uuid primary key default gen_random_uuid(),
  from_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  to_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  business_date date not null,
  branch_id uuid references public.branches(id) on delete restrict,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint cash_transfers_different_accounts check (from_account_id <> to_account_id)
);
create index cash_transfers_date_idx on public.cash_transfers (business_date desc, created_at desc);

create table public.cash_account_openings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.cash_accounts(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  business_date date not null,
  balance numeric(14,2) not null check (balance >= 0),
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index cash_account_openings_account_date_idx on public.cash_account_openings (account_id, business_date desc);

create table public.daily_cash_closings (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  account_id uuid not null references public.cash_accounts(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  version integer not null check (version > 0),
  expected_balance numeric(14,2) not null,
  counted_balance numeric(14,2) not null,
  variance numeric(14,2) not null,
  closed_by uuid not null references public.profiles(id) on delete restrict,
  closed_by_name text,
  closed_at timestamptz not null default now(),
  note text,
  constraint daily_cash_closings_variance_check check (variance = counted_balance - expected_balance),
  constraint daily_cash_closings_version_key unique (business_date, account_id, branch_id, version)
);
create index daily_cash_closings_date_idx on public.daily_cash_closings (business_date desc, branch_id, account_id, version desc);

create table public.finance_ledger_settings (
  singleton boolean primary key default true check (singleton),
  ledger_go_live_at timestamptz not null default now()
);
insert into public.finance_ledger_settings(singleton) values (true) on conflict (singleton) do nothing;

alter table public.expenses add column if not exists payment_method text;
alter table public.tuition_payments
  add column if not exists client_request_id uuid,
  add column if not exists client_request_user uuid references public.profiles(id) on delete set null;
alter table public.tuition_adjustments
  add column if not exists refund_batch_id uuid,
  add column if not exists refund_payment_method text;
create unique index if not exists tuition_payments_client_request_key
  on public.tuition_payments (client_request_user, client_request_id)
  where client_request_user is not null and client_request_id is not null;
create unique index if not exists tuition_adjustments_refund_batch_tuition_key
  on public.tuition_adjustments(refund_batch_id,tuition_id)
  where action='refund' and refund_batch_id is not null;

create schema if not exists private;

create or replace function private.finance_actor_can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and (
        p.role = 'admin'
        or (p.role = 'manager' and p.branch_id is not null and p.branch_id = p_branch_id)
      )
  );
$function$;
revoke all on function private.finance_actor_can_access_branch(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.finance_actor_can_access_branch(uuid) to authenticated;

create or replace function private.finance_require_actor(p_branch_id uuid, p_allow_null_branch boolean default false)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_branch uuid;
  v_active boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Bạn chưa đăng nhập.';
  end if;
  select p.role::text, p.branch_id, p.is_active
    into v_role, v_branch, v_active
  from public.profiles p where p.id = auth.uid();
  if not coalesce(v_active, false) or coalesce(v_role, '') not in ('admin', 'manager') then
    raise exception using errcode = '42501', message = 'Bạn không có quyền thao tác tài chính.';
  end if;
  if v_role = 'manager' and (p_branch_id is null or p_branch_id is distinct from v_branch) then
    raise exception using errcode = '42501', message = 'Bạn không có quyền thao tác tài chính tại cơ sở này.';
  end if;
  if v_role = 'admin' and p_branch_id is null and not p_allow_null_branch then
    raise exception using errcode = '22023', message = 'Giao dịch cần gắn với cơ sở.';
  end if;
  return v_role;
end;
$function$;
revoke all on function private.finance_require_actor(uuid, boolean) from public, anon, authenticated;

create or replace function private.finance_resolve_account(p_method text, p_branch_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_type text := case lower(coalesce(p_method, '')) when 'cash' then 'cash' when 'transfer' then 'bank' else null end;
  v_id uuid;
begin
  if v_type is null then
    raise exception 'Phương thức thanh toán phải là cash hoặc transfer.';
  end if;
  select a.id into v_id
  from public.cash_accounts a
  where a.is_active and a.account_type = v_type
    and (a.branch_id is null or a.branch_id = p_branch_id)
  order by (a.branch_id = p_branch_id) desc nulls last, a.is_default desc, a.created_at, a.id
  limit 1;
  if v_id is null then
    raise exception 'Không có tài khoản tiền đang hoạt động cho phương thức %.', v_type;
  end if;
  return v_id;
end;
$function$;
revoke all on function private.finance_resolve_account(text, uuid) from public, anon, authenticated;

create or replace function private.finance_insert_ledger(
  p_business_date date,
  p_account_id uuid,
  p_direction text,
  p_amount numeric,
  p_category text,
  p_description text,
  p_branch_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_reversal_of uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 or p_direction not in ('in', 'out') then
    raise exception 'Dòng tiền không hợp lệ.';
  end if;
  insert into public.cash_ledger (
    business_date, account_id, direction, amount, category, description, branch_id,
    source_type, source_id, created_by, created_by_name, metadata, reversal_of
  ) values (
    p_business_date, p_account_id, p_direction, p_amount, p_category,
    coalesce(nullif(trim(p_description), ''), p_category), p_branch_id,
    p_source_type, p_source_id, auth.uid(),
    (select p.full_name from public.profiles p where p.id=auth.uid()),
    coalesce(p_metadata, '{}'::jsonb), p_reversal_of
  ) on conflict (source_type, source_id, account_id) where source_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select l.id into v_id from public.cash_ledger l
    where l.source_type = p_source_type and l.source_id = p_source_id and l.account_id = p_account_id;
  end if;
  return v_id;
end;
$function$;
revoke all on function private.finance_insert_ledger(date, uuid, text, numeric, text, text, uuid, text, uuid, jsonb, uuid) from public, anon, authenticated;

create or replace function private.finance_post_tuition_payment()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_branch uuid;
  v_method text;
  v_account uuid;
  v_tuition record;
  v_student_name text;
  v_class_name text;
begin
  select t.branch_id, t.student_id, t.class_id, t.billing_month
    into v_tuition
  from public.tuition t where t.id = new.tuition_id;
  if not found then raise exception 'Không tìm thấy kỳ học phí cho giao dịch.'; end if;
  v_branch := v_tuition.branch_id;
  perform private.finance_require_actor(v_branch, false);
  v_method := lower(coalesce(nullif(new.payment_method, ''), nullif(new.method, ''), ''));
  v_account := private.finance_resolve_account(v_method, v_branch);
  select s.full_name,c.name into v_student_name,v_class_name
  from public.students s left join public.classes c on c.id=v_tuition.class_id
  where s.id=v_tuition.student_id;
  perform private.finance_insert_ledger(
    new.payment_date, v_account, 'in', new.amount, 'tuition',
    'Thu học phí · ' || coalesce(v_student_name,'Học viên') || ' · ' || coalesce(v_class_name,'Lớp') || ' · ' || to_char(v_tuition.billing_month, 'MM/YYYY'), v_branch,
    'tuition_payment', new.id,
    jsonb_build_object('tuition_id', new.tuition_id, 'student_id', v_tuition.student_id, 'student_name',v_student_name,'class_id', v_tuition.class_id,'class_name',v_class_name,'payment_method', v_method)
  );
  return new;
end;
$function$;
revoke all on function private.finance_post_tuition_payment() from public, anon, authenticated;
drop trigger if exists finance_post_tuition_payment on public.tuition_payments;
create trigger finance_post_tuition_payment after insert on public.tuition_payments
for each row execute function private.finance_post_tuition_payment();

create or replace function private.finance_tag_payment_request()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_request text := nullif(current_setting('finance.client_request_id', true), '');
  v_user text := nullif(current_setting('finance.client_request_user', true), '');
begin
  if v_request is not null then
    new.client_request_id := v_request::uuid;
    new.client_request_user := v_user::uuid;
  end if;
  if new.recorded_by is null then new.recorded_by := auth.uid(); end if;
  return new;
end;
$function$;
revoke all on function private.finance_tag_payment_request() from public, anon, authenticated;
drop trigger if exists finance_tag_payment_request on public.tuition_payments;
create trigger finance_tag_payment_request before insert on public.tuition_payments
for each row execute function private.finance_tag_payment_request();

create or replace function private.finance_post_expense()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_method text := lower(coalesce(nullif(new.payment_method, ''), ''));
  v_account uuid;
begin
  -- The existing payroll RPC records its chosen method in this verified note field.
  if new.category = 'salary' and coalesce(new.description,'') like 'Chi lương giáo viên - %'
     and lower(coalesce(new.note, '')) like '%phương thức: chuyển khoản%' then
    v_method := 'transfer';
  elsif new.category = 'salary' and coalesce(new.description,'') like 'Chi lương giáo viên - %'
     and lower(coalesce(new.note, '')) like '%phương thức: tiền mặt%' then
    v_method := 'cash';
  end if;
  if v_method = '' then raise exception 'Hãy chọn tài khoản tiền mặt hoặc chuyển khoản.'; end if;
  perform private.finance_require_actor(new.branch_id, true);
  v_account := private.finance_resolve_account(v_method, new.branch_id);
  perform private.finance_insert_ledger(
    new.expense_date, v_account, 'out', new.amount, new.category,
    coalesce(new.description, new.category), new.branch_id, 'expense', new.id,
    jsonb_build_object('payment_method', v_method, 'note', new.note)
  );
  return new;
end;
$function$;
revoke all on function private.finance_post_expense() from public, anon, authenticated;
drop trigger if exists finance_post_expense on public.expenses;
create trigger finance_post_expense after insert on public.expenses
for each row execute function private.finance_post_expense();

create or replace function private.finance_post_other_revenue()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_method text := lower(coalesce(new.payment_method, ''));
  v_account uuid;
begin
  perform private.finance_require_actor(new.branch_id, true);
  v_account := private.finance_resolve_account(v_method, new.branch_id);
  perform private.finance_insert_ledger(
    new.revenue_date, v_account, 'in', new.amount, new.category, new.description,
    new.branch_id, 'other_revenue', new.id,
    jsonb_build_object('payer_name', new.payer_name, 'payment_method', v_method, 'note', new.note)
  );
  return new;
end;
$function$;
revoke all on function private.finance_post_other_revenue() from public, anon, authenticated;
drop trigger if exists finance_post_other_revenue on public.other_revenues;
create trigger finance_post_other_revenue after insert on public.other_revenues
for each row execute function private.finance_post_other_revenue();

create or replace function private.finance_post_tuition_refund_batch()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_batch record;
  v_account uuid;
  v_student_name text;
  v_class_name text;
begin
  for v_batch in
    select a.refund_batch_id,a.student_id,sum(a.amount) amount,
      min(a.refund_payment_method) refund_payment_method,
      count(distinct t.branch_id) branch_count,
      (array_agg(t.branch_id order by t.billing_month))[1] branch_id,
      (array_agg(t.billing_month order by t.billing_month))[1] billing_month,
      array_agg(a.id) adjustment_ids
    from inserted_adjustments a join public.tuition t on t.id=a.tuition_id
    where a.action='refund'
    group by a.refund_batch_id,a.student_id
  loop
    if v_batch.refund_batch_id is null or v_batch.refund_payment_method not in ('cash','transfer') then
      raise exception 'Khoản hoàn tiền cần mã đợt và phương thức Tiền mặt hoặc Chuyển khoản.';
    end if;
    if v_batch.branch_count > 1 then
      perform private.finance_require_actor(null,true);
    else
      perform private.finance_require_actor(v_batch.branch_id,true);
    end if;
    v_account := private.finance_resolve_account(v_batch.refund_payment_method,case when v_batch.branch_count>1 then null else v_batch.branch_id end);
    select s.full_name,c.name into v_student_name,v_class_name
    from public.students s left join public.classes c on c.id=(
      select t.class_id from public.tuition t where t.student_id=v_batch.student_id and t.billing_month=v_batch.billing_month order by t.created_at limit 1
    ) where s.id=v_batch.student_id;
    perform private.finance_insert_ledger(
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,v_account,'out',v_batch.amount,'tuition_refund',
      'Hoàn học phí · ' || coalesce(v_student_name,'Học viên') || ' · ' || to_char(v_batch.billing_month,'MM/YYYY'),
      case when v_batch.branch_count>1 then null else v_batch.branch_id end,
      'tuition_refund',v_batch.refund_batch_id,
      jsonb_build_object('student_id',v_batch.student_id,'student_name',v_student_name,'class_name',v_class_name,
        'refund_payment_method',v_batch.refund_payment_method,'adjustment_ids',to_jsonb(v_batch.adjustment_ids))
    );
  end loop;
  return null;
end;
$function$;
revoke all on function private.finance_post_tuition_refund_batch() from public, anon, authenticated;
drop trigger if exists finance_post_tuition_refund_batch on public.tuition_adjustments;
create trigger finance_post_tuition_refund_batch after insert on public.tuition_adjustments
referencing new table as inserted_adjustments for each statement
execute function private.finance_post_tuition_refund_batch();

create or replace function private.finance_immutable_refund_adjustment()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_batch uuid := case when tg_op='DELETE' then old.refund_batch_id else old.refund_batch_id end;
begin
  if old.action='refund' and exists(select 1 from public.cash_ledger l where l.source_type='tuition_refund' and l.source_id=v_batch) then
    raise exception using errcode='55000',message='Khoản hoàn tiền đã vào sổ quỹ và không thể sửa hoặc xóa.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;
revoke all on function private.finance_immutable_refund_adjustment() from public, anon, authenticated;
drop trigger if exists finance_immutable_refund_adjustment on public.tuition_adjustments;
create trigger finance_immutable_refund_adjustment before update or delete on public.tuition_adjustments
for each row execute function private.finance_immutable_refund_adjustment();

create or replace function private.finance_reject_source_mutation()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_type text := case tg_table_name when 'tuition_payments' then 'tuition_payment' when 'other_revenues' then 'other_revenue' else 'expense' end;
  v_id uuid := old.id;
  v_go_live timestamptz;
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id
     and exists (select 1 from public.cash_ledger l where l.source_type=v_type and l.source_id=old.id) then
    raise exception using errcode='55000', message='Không thể đổi mã giao dịch đã có trong sổ quỹ.';
  end if;
  if exists (select 1 from public.cash_ledger l where l.source_type = v_type and l.source_id = v_id) then
    raise exception using errcode = '55000', message = 'Giao dịch đã vào sổ quỹ; hãy lập bút toán đảo để giữ lịch sử.';
  end if;
  if tg_table_name in ('expenses','other_revenues') then
    select s.ledger_go_live_at into v_go_live from public.finance_ledger_settings s where s.singleton;
    if old.created_at < v_go_live then
      raise exception using errcode='55000', message='Dữ liệu tài chính trước ngày mở sổ chỉ được xem, không thể sửa hoặc xóa.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
revoke all on function private.finance_reject_source_mutation() from public, anon, authenticated;
drop trigger if exists finance_immutable_expense on public.expenses;
create trigger finance_immutable_expense before update or delete on public.expenses for each row execute function private.finance_reject_source_mutation();
drop trigger if exists finance_immutable_other_revenue on public.other_revenues;
create trigger finance_immutable_other_revenue before update or delete on public.other_revenues for each row execute function private.finance_reject_source_mutation();
drop trigger if exists finance_immutable_tuition_payment on public.tuition_payments;
create trigger finance_immutable_tuition_payment before update or delete on public.tuition_payments for each row execute function private.finance_reject_source_mutation();

create or replace function private.finance_reject_ledger_mutation()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  raise exception using errcode = '55000', message = 'Sổ quỹ chỉ được ghi thêm; hãy tạo giao dịch đảo để điều chỉnh.';
end;
$function$;
revoke all on function private.finance_reject_ledger_mutation() from public, anon, authenticated;
create trigger cash_ledger_reject_update_delete before update or delete on public.cash_ledger
for each row execute function private.finance_reject_ledger_mutation();
create trigger cash_ledger_reject_truncate before truncate on public.cash_ledger
for each statement execute function private.finance_reject_ledger_mutation();
create trigger cash_closings_reject_update_delete before update or delete on public.daily_cash_closings
for each row execute function private.finance_reject_ledger_mutation();
create trigger cash_closings_reject_truncate before truncate on public.daily_cash_closings
for each statement execute function private.finance_reject_ledger_mutation();
create trigger cash_openings_reject_update_delete before update or delete on public.cash_account_openings
for each row execute function private.finance_reject_ledger_mutation();
create trigger cash_openings_reject_truncate before truncate on public.cash_account_openings
for each statement execute function private.finance_reject_ledger_mutation();

create or replace function private.finance_insert_reversal(p_original public.cash_ledger, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_id uuid;
begin
  insert into public.cash_ledger (
    occurred_at,created_at,business_date,account_id,direction,amount,category,description,branch_id,
    source_type,source_id,created_by,created_by_name,reversal_of,metadata
  ) values (
    now(),now(),p_original.business_date,p_original.account_id,
    case p_original.direction when 'in' then 'out' else 'in' end,p_original.amount,
    'reversal','Đảo: ' || p_original.description,p_original.branch_id,
    'reversal',p_original.id,auth.uid(),(select p.full_name from public.profiles p where p.id=auth.uid()),
    p_original.id,jsonb_build_object('original_source_type',p_original.source_type,
      'original_source_id',p_original.source_id,'note',trim(p_note))
  ) returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function private.finance_insert_reversal(public.cash_ledger,text) from public, anon, authenticated;

create or replace function public.reverse_cash_ledger(p_ledger_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_original public.cash_ledger%rowtype;
  v_reversal_id uuid;
begin
  select * into v_original from public.cash_ledger where id = p_ledger_id for update;
  if not found then raise exception 'Không tìm thấy giao dịch sổ quỹ.'; end if;
  perform private.finance_require_actor(v_original.branch_id, true);
  if v_original.reversal_of is not null then raise exception 'Không thể đảo một giao dịch đảo.'; end if;
  if exists (select 1 from public.finance_source_reversals r where r.source_type=v_original.source_type and r.source_id=v_original.source_id)
     or exists (select 1 from public.cash_ledger where reversal_of = p_ledger_id) then
    raise exception 'Giao dịch này đã được đảo trước đó.';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'Cần ghi lý do đảo giao dịch.'; end if;
  if v_original.source_type='account_transfer' then
    raise exception 'Không thể đảo một phía của giao dịch chuyển quỹ; hãy đảo cả giao dịch chuyển quỹ.';
  elsif v_original.source_type='opening_balance' then
    raise exception 'Hãy đảo số dư đầu kỳ qua thao tác chuyên biệt.';
  elsif v_original.source_type in ('tuition_payment','tuition_refund') then
    raise exception 'Không đảo ledger riêng cho học phí. Dùng nghiệp vụ hoàn tiền/thu học phí để báo cáo nguồn được cập nhật.';
  elsif v_original.source_type not in ('expense','other_revenue') then
    raise exception 'Nguồn giao dịch không hỗ trợ đảo qua RPC này.';
  end if;
  if v_original.source_id is null then raise exception 'Giao dịch nguồn không có mã liên kết.'; end if;
  if v_original.source_type='expense' and not exists(select 1 from public.expenses e where e.id=v_original.source_id) then
    raise exception 'Không tìm thấy khoản chi gốc.';
  elsif v_original.source_type='other_revenue' and not exists(select 1 from public.other_revenues r where r.id=v_original.source_id) then
    raise exception 'Không tìm thấy khoản thu gốc.';
  end if;
  v_reversal_id := private.finance_insert_reversal(v_original,p_note);
  insert into public.finance_source_reversals(
    source_type,source_id,original_ledger_ids,reversal_ledger_ids,branch_id,reason,reversed_by,reversed_by_name
  ) values (
    v_original.source_type,v_original.source_id,array[v_original.id],array[v_reversal_id],v_original.branch_id,
    trim(p_note),auth.uid(),(select p.full_name from public.profiles p where p.id=auth.uid())
  );
  return jsonb_build_object('success',true,'reversal_ids',jsonb_build_array(v_reversal_id),
    'original_ids',jsonb_build_array(v_original.id),'amount',v_original.amount,'source_type',v_original.source_type,'source_id',v_original.source_id);
end;
$function$;
revoke all on function public.reverse_cash_ledger(uuid, text) from public, anon;
grant execute on function public.reverse_cash_ledger(uuid, text) to authenticated;

create or replace function public.reverse_cash_transfer(p_transfer_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_transfer public.cash_transfers%rowtype;
  v_originals public.cash_ledger[];
  v_first uuid;
  v_second uuid;
begin
  select * into v_transfer from public.cash_transfers where id=p_transfer_id for update;
  if not found then raise exception 'Không tìm thấy giao dịch chuyển quỹ.'; end if;
  perform private.finance_require_actor(v_transfer.branch_id,true);
  if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Cần ghi lý do đảo giao dịch.'; end if;
  if exists(select 1 from public.finance_source_reversals r where r.source_type='account_transfer' and r.source_id=p_transfer_id) then
    raise exception 'Giao dịch chuyển quỹ này đã được đảo.';
  end if;
  perform 1 from public.cash_ledger l
    where l.source_type='account_transfer' and l.source_id=p_transfer_id order by l.id for update;
  select array_agg(l order by l.id) into v_originals from public.cash_ledger l
    where l.source_type='account_transfer' and l.source_id=p_transfer_id;
  if coalesce(cardinality(v_originals),0)<>2 then raise exception 'Chuyển quỹ phải có đủ hai phía trong sổ.'; end if;
  if exists(select 1 from unnest(v_originals) l where l.reversal_of is not null)
     or exists(select 1 from public.cash_ledger l where l.reversal_of=any(array[(v_originals[1]).id,(v_originals[2]).id])) then
    raise exception 'Một phía của giao dịch đã được đảo; cần rà soát sổ quỹ trước khi tiếp tục.';
  end if;
  if (v_originals[1]).direction=(v_originals[2]).direction
     or abs((v_originals[1]).amount-(v_originals[2]).amount)>0.01
     or (v_originals[1]).account_id=(v_originals[2]).account_id
     or not exists(select 1 from unnest(v_originals) l where l.direction='out' and l.account_id=v_transfer.from_account_id and abs(l.amount-v_transfer.amount)<=0.01)
     or not exists(select 1 from unnest(v_originals) l where l.direction='in' and l.account_id=v_transfer.to_account_id and abs(l.amount-v_transfer.amount)<=0.01) then
    raise exception 'Hai phía của giao dịch chuyển quỹ không khớp nhau.';
  end if;
  v_first := private.finance_insert_reversal(v_originals[1],p_note);
  v_second := private.finance_insert_reversal(v_originals[2],p_note);
  insert into public.finance_source_reversals(
    source_type,source_id,original_ledger_ids,reversal_ledger_ids,branch_id,reason,reversed_by,reversed_by_name
  ) values (
    'account_transfer',p_transfer_id,array[(v_originals[1]).id,(v_originals[2]).id],array[v_first,v_second],
    v_transfer.branch_id,trim(p_note),auth.uid(),(select p.full_name from public.profiles p where p.id=auth.uid())
  );
  return jsonb_build_object('success',true,'transfer_id',p_transfer_id,'reversal_ids',jsonb_build_array(v_first,v_second));
end;
$function$;
revoke all on function public.reverse_cash_transfer(uuid,text) from public,anon;
grant execute on function public.reverse_cash_transfer(uuid,text) to authenticated;

create or replace function public.reverse_cash_opening_balance(p_opening_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_opening public.cash_account_openings%rowtype;
  v_original public.cash_ledger%rowtype;
  v_reversal_id uuid;
begin
  select * into v_opening from public.cash_account_openings where id=p_opening_id for update;
  if not found then raise exception 'Không tìm thấy số dư đầu kỳ.'; end if;
  perform private.finance_require_actor(v_opening.branch_id,false);
  if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Cần ghi lý do đảo số dư đầu kỳ.'; end if;
  if exists(select 1 from public.finance_source_reversals r where r.source_type='opening_balance' and r.source_id=p_opening_id) then
    raise exception 'Số dư đầu kỳ này đã được đảo.';
  end if;
  select * into v_original from public.cash_ledger l where l.source_type='opening_balance' and l.source_id=p_opening_id for update;
  if not found then raise exception 'Số dư đầu kỳ không có bút toán tiền để đảo.'; end if;
  perform private.finance_require_actor(v_original.branch_id,true);
  v_reversal_id := private.finance_insert_reversal(v_original,p_note);
  insert into public.finance_source_reversals(
    source_type,source_id,original_ledger_ids,reversal_ledger_ids,branch_id,reason,reversed_by,reversed_by_name
  ) values (
    'opening_balance',p_opening_id,array[v_original.id],array[v_reversal_id],v_opening.branch_id,
    trim(p_note),auth.uid(),(select p.full_name from public.profiles p where p.id=auth.uid())
  );
  return jsonb_build_object('success',true,'opening_id',p_opening_id,'reversal_id',v_reversal_id);
end;
$function$;
revoke all on function public.reverse_cash_opening_balance(uuid,text) from public,anon;
grant execute on function public.reverse_cash_opening_balance(uuid,text) to authenticated;

create or replace function public.collect_tuition_payment_idempotent_atomic(
  p_student_id uuid, p_class_id uuid, p_billing_month date, p_amount_due numeric,
  p_amount numeric, p_payment_method text, p_client_request_id uuid,
  p_payment_date date default null, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_role text;
  v_branch uuid;
  v_active boolean;
  v_class_branch uuid;
  v_payment public.tuition_payments%rowtype;
  v_tuition public.tuition%rowtype;
  v_result jsonb;
  v_due numeric;
  v_paid numeric;
  v_remaining numeric;
begin
  if auth.uid() is null or p_client_request_id is null then raise exception using errcode='42501', message='Thiếu phiên đăng nhập hoặc mã yêu cầu thu.'; end if;
  select p.role::text,p.branch_id,p.is_active into v_role,v_branch,v_active from public.profiles p where p.id=auth.uid();
  if not coalesce(v_active,false) or coalesce(v_role,'') not in ('admin','manager') then raise exception using errcode='42501', message='Bạn không có quyền thu học phí.'; end if;
  select c.branch_id into v_class_branch from public.classes c where c.id=p_class_id;
  if not found or (v_role='manager' and v_branch is distinct from v_class_branch) then raise exception using errcode='42501', message='Bạn không có quyền thu học phí tại cơ sở này.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_client_request_id::text, 0));
  select * into v_payment from public.tuition_payments tp
    where tp.client_request_user=auth.uid() and tp.client_request_id=p_client_request_id;
  if found then
    select * into v_tuition from public.tuition t where t.id=v_payment.tuition_id;
    if v_tuition.student_id is distinct from p_student_id or v_tuition.class_id is distinct from p_class_id
       or v_tuition.billing_month is distinct from date_trunc('month',p_billing_month)::date
       or abs(v_payment.amount-p_amount)>0.01
       or v_payment.payment_method is distinct from lower(p_payment_method) then
      raise exception 'Mã yêu cầu thu đã được dùng cho dữ liệu khác.';
    end if;
    select greatest(coalesce(v_tuition.amount_due,0)-coalesce(sum(ta.amount) filter(where ta.action='cancel'),0),0),
      greatest(coalesce(v_tuition.amount_paid,0),coalesce((select sum(tp.amount) from public.tuition_payments tp where tp.tuition_id=v_tuition.id),0))
        + coalesce(sum(ta.amount) filter(where ta.action='carry_forward' and ta.target_tuition_id=v_tuition.id),0)
      into v_due,v_paid from public.tuition_adjustments ta
      where ta.tuition_id=v_tuition.id or ta.target_tuition_id=v_tuition.id;
    v_remaining := greatest(v_due-v_paid,0);
    return jsonb_build_object('success',true,'already_processed',true,'tuition_id',v_tuition.id,
      'remaining_amount',v_remaining,'status',case when v_remaining<=0 then 'paid' else 'partial' end,
      'payment_result',jsonb_build_object('payment_id',v_payment.id,'amount',v_payment.amount));
  end if;
  perform set_config('finance.client_request_id',p_client_request_id::text,true);
  perform set_config('finance.client_request_user',auth.uid()::text,true);
  v_result := public.collect_tuition_payment_atomic(
    p_student_id,p_class_id,p_billing_month,p_amount_due,p_amount,p_payment_method,p_payment_date,p_note
  );
  return v_result || jsonb_build_object('already_processed',false);
end;
$function$;
revoke all on function public.collect_tuition_payment_idempotent_atomic(uuid,uuid,date,numeric,numeric,text,uuid,date,text) from public, anon;
grant execute on function public.collect_tuition_payment_idempotent_atomic(uuid,uuid,date,numeric,numeric,text,uuid,date,text) to authenticated;

create or replace function public.transfer_cash_between_accounts(
  p_from_account_id uuid, p_to_account_id uuid, p_amount numeric,
  p_business_date date, p_branch_id uuid, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_transfer public.cash_transfers%rowtype;
  v_from public.cash_accounts%rowtype;
  v_to public.cash_accounts%rowtype;
begin
  perform private.finance_require_actor(p_branch_id, false);
  if p_amount is null or p_amount <= 0 or p_from_account_id = p_to_account_id then raise exception 'Thông tin chuyển quỹ không hợp lệ.'; end if;
  select * into v_from from public.cash_accounts where id = p_from_account_id and is_active for update;
  select * into v_to from public.cash_accounts where id = p_to_account_id and is_active for update;
  if v_from.id is null or v_to.id is null then raise exception 'Tài khoản chuyển quỹ không hợp lệ.'; end if;
  if v_from.branch_id is not null and v_from.branch_id is distinct from p_branch_id then raise exception 'Không có quyền dùng tài khoản nguồn.'; end if;
  if v_to.branch_id is not null and v_to.branch_id is distinct from p_branch_id then raise exception 'Không có quyền dùng tài khoản nhận.'; end if;
  insert into public.cash_transfers(from_account_id,to_account_id,amount,business_date,branch_id,note,created_by)
  values(p_from_account_id,p_to_account_id,p_amount,p_business_date,p_branch_id,nullif(trim(p_note),''),auth.uid()) returning * into v_transfer;
  perform private.finance_insert_ledger(p_business_date,p_from_account_id,'out',p_amount,'transfer','Chuyển quỹ đi',p_branch_id,'account_transfer',v_transfer.id,jsonb_build_object('to_account_id',p_to_account_id,'note',p_note));
  perform private.finance_insert_ledger(p_business_date,p_to_account_id,'in',p_amount,'transfer','Chuyển quỹ đến',p_branch_id,'account_transfer',v_transfer.id,jsonb_build_object('from_account_id',p_from_account_id,'note',p_note));
  return jsonb_build_object('success',true,'transfer_id',v_transfer.id,'amount',p_amount);
end;
$function$;
revoke all on function public.transfer_cash_between_accounts(uuid,uuid,numeric,date,uuid,text) from public, anon;
grant execute on function public.transfer_cash_between_accounts(uuid,uuid,numeric,date,uuid,text) to authenticated;

create or replace function public.record_cash_opening_balance(
  p_account_id uuid, p_branch_id uuid, p_business_date date, p_balance numeric, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_account public.cash_accounts%rowtype;
  v_opening public.cash_account_openings%rowtype;
begin
  perform private.finance_require_actor(p_branch_id, false);
  if p_balance is null or p_balance <= 0 or p_business_date is null then raise exception 'Số dư đầu kỳ phải lớn hơn 0; khi chưa có tiền hãy ghi số dư sau khi kiểm đếm.'; end if;
  select * into v_account from public.cash_accounts where id=p_account_id and is_active for update;
  if not found or (v_account.branch_id is not null and v_account.branch_id is distinct from p_branch_id) then
    raise exception 'Tài khoản đầu kỳ không hợp lệ.';
  end if;
  if exists (
    select 1 from public.cash_account_openings o
    where o.account_id=p_account_id and o.branch_id is not distinct from p_branch_id
      and exists (
        select 1 from public.cash_ledger l where l.source_type='opening_balance' and l.source_id=o.id
          and not exists (select 1 from public.finance_source_reversals r where r.source_type='opening_balance' and r.source_id=o.id)
      )
  ) then raise exception 'Tài khoản này đã có số dư đầu kỳ chưa được đảo.'; end if;
  insert into public.cash_account_openings(account_id,branch_id,business_date,balance,note,created_by)
  values(p_account_id,p_branch_id,p_business_date,p_balance,nullif(trim(p_note),''),auth.uid()) returning * into v_opening;
  if p_balance > 0 then
    perform private.finance_insert_ledger(
      p_business_date,p_account_id,'in',p_balance,'opening_balance','Số dư đầu kỳ · ' || v_account.name,
      p_branch_id,'opening_balance',v_opening.id,jsonb_build_object('note',p_note,'account_id',p_account_id)
    );
  end if;
  return jsonb_build_object('success',true,'opening_id',v_opening.id,'account_id',p_account_id,'balance',p_balance);
end;
$function$;
revoke all on function public.record_cash_opening_balance(uuid,uuid,date,numeric,text) from public, anon;
grant execute on function public.record_cash_opening_balance(uuid,uuid,date,numeric,text) to authenticated;

create or replace function public.close_daily_cash(
  p_business_date date, p_branch_id uuid, p_counts jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_account record;
  v_count jsonb;
  v_expected numeric;
  v_counted numeric;
  v_version integer;
  v_rows jsonb := '[]'::jsonb;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if p_branch_id is null then raise exception 'Chọn một cơ sở cụ thể để chốt quỹ.'; end if;
  perform private.finance_require_actor(p_branch_id, false);
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.status::text='active') then
    raise exception 'Cơ sở chốt quỹ không tồn tại hoặc đã ngừng hoạt động.';
  end if;
  if p_business_date is null or p_business_date > v_today then raise exception 'Ngày chốt quỹ không hợp lệ.'; end if;
  if jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then raise exception 'Cần nhập số tiền đếm được cho ít nhất một tài khoản.'; end if;
  for v_count in select value from jsonb_array_elements(p_counts)
  loop
    select a.id, a.name into v_account from public.cash_accounts a
      where a.id = nullif(v_count->>'account_id','')::uuid and a.is_active
        and (a.branch_id is null or a.branch_id = p_branch_id)
      for update;
    if not found then raise exception 'Tài khoản chốt quỹ không hợp lệ.'; end if;
    v_counted := nullif(v_count->>'counted_balance','')::numeric;
    if v_counted is null or v_counted < 0 then raise exception 'Số tiền đếm được không hợp lệ.'; end if;
    select coalesce(sum(case l.direction when 'in' then l.amount else -l.amount end),0)
      into v_expected from public.cash_ledger l
      where l.account_id=v_account.id and l.business_date <= p_business_date
        and (p_branch_id is null or l.branch_id = p_branch_id);
    select coalesce(max(c.version),0)+1 into v_version from public.daily_cash_closings c
      where c.business_date=p_business_date and c.account_id=v_account.id
        and c.branch_id is not distinct from p_branch_id;
  insert into public.daily_cash_closings(business_date,account_id,branch_id,version,expected_balance,counted_balance,variance,closed_by,closed_by_name,note)
    values(p_business_date,v_account.id,p_branch_id,v_version,v_expected,v_counted,v_counted-v_expected,auth.uid(),(select p.full_name from public.profiles p where p.id=auth.uid()),nullif(trim(v_count->>'note'),''));
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('account_id',v_account.id,'account_name',v_account.name,'expected_balance',v_expected,'counted_balance',v_counted,'variance',v_counted-v_expected,'version',v_version));
  end loop;
  return jsonb_build_object('success',true,'business_date',p_business_date,'closings',v_rows);
end;
$function$;
revoke all on function public.close_daily_cash(date,uuid,jsonb) from public, anon;
grant execute on function public.close_daily_cash(date,uuid,jsonb) to authenticated;

create or replace function public.get_cash_balances_as_of(p_business_date date, p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_result jsonb;
begin
  perform private.finance_require_actor(p_branch_id, true);
  if p_business_date is null or p_business_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày xem số dư không hợp lệ.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',a.id,'name',a.name,'account_type',a.account_type,'is_active',a.is_active,
    'balance',coalesce(sum(case l.direction when 'in' then l.amount else -l.amount end),0)
  ) order by a.account_type,a.name),'[]'::jsonb)
  into v_result
  from public.cash_accounts a left join public.cash_ledger l
    on l.account_id=a.id and l.business_date<=p_business_date
    and (p_branch_id is null or l.branch_id=p_branch_id)
  where a.branch_id is null or a.branch_id=p_branch_id
  group by a.id;
  return coalesce(v_result,'[]'::jsonb);
end;
$function$;
revoke all on function public.get_cash_balances_as_of(date,uuid) from public, anon;
grant execute on function public.get_cash_balances_as_of(date,uuid) to authenticated;

create or replace function public.get_finance_audit(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_active boolean;
  v_role text;
  v_issues jsonb;
  v_start timestamptz;
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30);
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
begin
  if auth.uid() is null then raise exception using errcode='42501', message='Bạn chưa đăng nhập.'; end if;
  select p.role::text,p.is_active into v_role,v_active from public.profiles p where p.id=auth.uid();
  if v_role <> 'admin' or not coalesce(v_active,false) then raise exception using errcode='42501', message='Chỉ Admin đang hoạt động được xem giám sát tài chính.'; end if;
  if v_to < v_from or v_to - v_from > 366 then raise exception 'Khoảng ngày giám sát tối đa là 367 ngày.'; end if;
  select ledger_go_live_at into v_start from public.finance_ledger_settings where singleton;
  with issues as (
    select 'missing_ledger'::text issue_type, 'error'::text severity, tp.payment_date business_date, tp.id transaction_id, null::uuid account_id, tp.amount amount,
      'Khoản thu học phí không có dòng sổ quỹ.'::text message
    from public.tuition_payments tp left join public.cash_ledger l on l.source_type='tuition_payment' and l.source_id=tp.id
    where tp.created_at>=v_start and tp.payment_date between v_from and v_to and l.id is null
    union all
    select 'payment_amount_mismatch','error',tp.payment_date,tp.id,l.account_id,tp.amount-l.amount,
      'Số tiền payment học phí không khớp sổ quỹ.'
    from public.tuition_payments tp join public.cash_ledger l on l.source_type='tuition_payment' and l.source_id=tp.id
    where tp.created_at>=v_start and tp.payment_date between v_from and v_to and abs(tp.amount-l.amount)>0.01
    union all
    select 'missing_ledger','error',(min(a.created_at) at time zone 'Asia/Ho_Chi_Minh')::date,a.refund_batch_id,null::uuid,sum(a.amount),
      'Khoản hoàn học phí không có dòng sổ quỹ.'
    from public.tuition_adjustments a
    where a.action='refund' and a.created_at>=v_start
    group by a.refund_batch_id
    having ((min(a.created_at) at time zone 'Asia/Ho_Chi_Minh')::date between v_from and v_to)
      and (a.refund_batch_id is null or not exists (
      select 1 from public.cash_ledger l where l.source_type='tuition_refund' and l.source_id=a.refund_batch_id
    ))
    union all
    select 'refund_amount_mismatch','error',l.business_date,l.id,l.account_id,
      coalesce(sum(a.amount),0)-l.amount,'Số tiền hoàn học phí không khớp sổ quỹ.'
    from public.cash_ledger l left join public.tuition_adjustments a
      on a.action='refund' and a.refund_batch_id=l.source_id
    where l.source_type='tuition_refund' and l.business_date between v_from and v_to
    group by l.id,l.business_date,l.account_id,l.amount
    having abs(coalesce(sum(a.amount),0)-l.amount)>0.01
    union all
    select 'orphan_ledger','error',l.business_date,l.id,l.account_id,l.amount,'Dòng sổ quỹ không tìm thấy nguồn tương ứng.'
    from public.cash_ledger l left join public.tuition_payments tp on l.source_type='tuition_payment' and tp.id=l.source_id
    left join public.expenses e on l.source_type='expense' and e.id=l.source_id
    left join public.other_revenues r on l.source_type='other_revenue' and r.id=l.source_id
    left join public.tuition_adjustments ta on l.source_type='tuition_refund' and ta.action='refund' and ta.refund_batch_id=l.source_id
    where l.business_date between v_from and v_to and l.source_type in ('tuition_payment','tuition_refund','expense','other_revenue')
      and tp.id is null and e.id is null and r.id is null and ta.id is null
    union all
    select 'missing_ledger','error',e.expense_date,e.id,null::uuid,e.amount,'Khoản chi không có dòng sổ quỹ.'
    from public.expenses e left join public.cash_ledger l on l.source_type='expense' and l.source_id=e.id
    where e.created_at>=v_start and e.expense_date between v_from and v_to and l.id is null
    union all
    select 'missing_ledger','error',r.revenue_date,r.id,null::uuid,r.amount,'Khoản thu khác không có dòng sổ quỹ.'
    from public.other_revenues r left join public.cash_ledger l on l.source_type='other_revenue' and l.source_id=r.id
    where r.created_at>=v_start and r.revenue_date between v_from and v_to and l.id is null
    union all
    select 'reversal','warning',l.business_date,l.id,l.account_id,l.amount,'Có giao dịch đảo: ' || l.description
    from public.cash_ledger l where l.business_date between v_from and v_to and l.reversal_of is not null
    union all
    select 'unknown_source','warning',l.business_date,l.id,l.account_id,l.amount,'Nguồn giao dịch chưa được nhận diện: ' || l.source_type
    from public.cash_ledger l where l.business_date between v_from and v_to and l.source_type not in ('tuition_payment','tuition_refund','expense','other_revenue','reversal','account_transfer','opening_balance')
    union all
    select 'created_after_closing','warning',l.business_date,l.id,l.account_id,l.amount,'Giao dịch được ghi sau lần chốt quỹ gần nhất.'
    from public.cash_ledger l join lateral (
      select c.closed_at from public.daily_cash_closings c where c.business_date=l.business_date and c.account_id=l.account_id
        and c.branch_id is not distinct from l.branch_id order by c.version desc limit 1
    ) c on l.created_at>c.closed_at
    where l.business_date between v_from and v_to
    union all
    select 'cash_variance','error',c.business_date,c.id,c.account_id,c.variance,
      case when c.variance<0 then 'Thiếu quỹ ' || to_char(abs(c.variance),'FM999,999,999,990') || 'đ' else 'Thừa quỹ ' || to_char(c.variance,'FM999,999,999,990') || 'đ' end
    from public.daily_cash_closings c join lateral (
      select max(c2.version) version from public.daily_cash_closings c2 where c2.business_date=c.business_date and c2.account_id=c.account_id and c2.branch_id is not distinct from c.branch_id
    ) newest on newest.version=c.version
    where c.business_date between v_from and v_to and abs(c.variance)>0.01
    union all
    select 'unclosed_day','warning',d.day::date,null::uuid,a.id,null::numeric,'Ngày chưa chốt quỹ · ' || a.name
    from generate_series(
      greatest(v_from,(v_start at time zone 'Asia/Ho_Chi_Minh')::date),
      least(v_to,(now() at time zone 'Asia/Ho_Chi_Minh')::date - 1),
      interval '1 day'
    ) d(day)
    cross join public.cash_accounts a
    cross join (select b.id branch_id from public.branches b where b.status::text='active') scopes
    where a.is_active and (a.branch_id is null or a.branch_id=scopes.branch_id)
      and not exists (
        select 1 from public.daily_cash_closings c
        where c.business_date=d.day::date and c.account_id=a.id and c.branch_id=scopes.branch_id
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object('issue_type',issue_type,'severity',severity,'business_date',business_date,'transaction_id',transaction_id,'account_id',account_id,'amount',amount,'message',message) order by business_date desc, issue_type), '[]'::jsonb)
  into v_issues from issues;
  return jsonb_build_object('from',v_from,'to',v_to,'issues',v_issues,'ok',jsonb_array_length(v_issues)=0);
end;
$function$;
revoke all on function public.get_finance_audit(date,date) from public, anon;
grant execute on function public.get_finance_audit(date,date) to authenticated;

alter table public.cash_accounts enable row level security;
alter table public.cash_ledger enable row level security;
alter table public.cash_transfers enable row level security;
alter table public.cash_account_openings enable row level security;
alter table public.daily_cash_closings enable row level security;
alter table public.finance_ledger_settings enable row level security;
alter table public.finance_source_reversals enable row level security;

create policy cash_accounts_finance_read on public.cash_accounts for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and (p.role='admin' or (p.role='manager' and (cash_accounts.branch_id is null or cash_accounts.branch_id=p.branch_id)))));
create policy cash_ledger_finance_read on public.cash_ledger for select to authenticated
using (private.finance_actor_can_access_branch(branch_id));
create policy cash_transfers_finance_read on public.cash_transfers for select to authenticated
using (private.finance_actor_can_access_branch(branch_id));
create policy cash_openings_finance_read on public.cash_account_openings for select to authenticated
using (private.finance_actor_can_access_branch(branch_id));
create policy cash_closings_finance_read on public.daily_cash_closings for select to authenticated
using (private.finance_actor_can_access_branch(branch_id));
create policy finance_settings_admin_read on public.finance_ledger_settings for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role='admin'));
create policy finance_source_reversals_read on public.finance_source_reversals for select to authenticated
using (private.finance_actor_can_access_branch(branch_id));

drop policy if exists other_revenues_staff_select on public.other_revenues;
drop policy if exists other_revenues_staff_insert on public.other_revenues;
drop policy if exists other_revenues_staff_update on public.other_revenues;
create policy other_revenues_finance_select on public.other_revenues for select to authenticated
using (private.finance_actor_can_access_branch(branch_id));
create policy other_revenues_finance_insert on public.other_revenues for insert to authenticated
with check (created_by=auth.uid() and private.finance_actor_can_access_branch(branch_id));
create policy other_revenues_finance_update on public.other_revenues for update to authenticated
using (private.finance_actor_can_access_branch(branch_id))
with check (private.finance_actor_can_access_branch(branch_id));

revoke all on public.cash_accounts, public.cash_ledger, public.cash_transfers, public.cash_account_openings, public.daily_cash_closings, public.finance_ledger_settings, public.finance_source_reversals from anon, authenticated;
grant select on public.cash_accounts, public.cash_ledger, public.cash_transfers, public.cash_account_openings, public.daily_cash_closings, public.finance_source_reversals to authenticated;

create trigger finance_source_reversals_reject_update_delete before update or delete on public.finance_source_reversals
for each row execute function private.finance_reject_ledger_mutation();
create trigger finance_source_reversals_reject_truncate before truncate on public.finance_source_reversals
for each statement execute function private.finance_reject_ledger_mutation();

create or replace function private.finance_log_ledger_insert()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_name text;
  v_role text;
begin
  select p.full_name,p.role::text into v_name,v_role from public.profiles p where p.id=auth.uid();
  insert into public.activity_logs(user_id,action,entity_type,entity_id,new_data,branch_id,business_group,actor_name_snapshot,actor_role_snapshot)
  values(auth.uid(),'INSERT','cash_ledger',new.id,to_jsonb(new),new.branch_id,'finance',v_name,v_role);
  return new;
end;
$function$;
revoke all on function private.finance_log_ledger_insert() from public, anon, authenticated;
create trigger audit_cash_ledger_finance after insert on public.cash_ledger for each row execute function private.finance_log_ledger_insert();

create or replace function private.finance_log_closing_insert()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_name text;
  v_role text;
begin
  select p.full_name,p.role::text into v_name,v_role from public.profiles p where p.id=new.closed_by;
  insert into public.activity_logs(user_id,action,entity_type,entity_id,new_data,branch_id,business_group,actor_name_snapshot,actor_role_snapshot)
  values(new.closed_by,'INSERT','daily_cash_closings',new.id,to_jsonb(new),new.branch_id,'finance',v_name,v_role);
  return new;
end;
$function$;
revoke all on function private.finance_log_closing_insert() from public, anon, authenticated;
create trigger audit_daily_cash_closing after insert on public.daily_cash_closings for each row execute function private.finance_log_closing_insert();

do $realtime$
declare
  v_table text;
begin
  foreach v_table in array array['cash_accounts','cash_ledger','cash_transfers','cash_account_openings','daily_cash_closings','finance_source_reversals']
  loop
    if exists (select 1 from pg_publication where pubname='supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end
$realtime$;

commit;
