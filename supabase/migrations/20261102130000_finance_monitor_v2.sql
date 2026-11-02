begin;

-- Admin review records are separate from the immutable financial ledger.
create table if not exists public.finance_monitor_reviews (
  issue_key text primary key,
  review_status text not null default 'unchecked'
    check (review_status in ('unchecked','reviewing','verified','fixed')),
  review_note text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint finance_monitor_review_key_length check (char_length(issue_key) between 5 and 350),
  constraint finance_monitor_review_note_length check (char_length(review_note) <= 1000)
);
alter table public.finance_monitor_reviews enable row level security;
revoke all on public.finance_monitor_reviews from public, anon, authenticated;

create or replace function public.set_finance_monitor_review(
  p_issue_key text, p_review_status text, p_review_note text default ''
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false)
     or not exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active)
  then
    raise exception using errcode='42501', message='Chỉ Admin đang hoạt động được đối chiếu giám sát tài chính.';
  end if;
  if p_issue_key is null or char_length(p_issue_key) not between 5 and 350
     or p_review_status not in ('unchecked','reviewing','verified','fixed')
     or char_length(coalesce(p_review_note,'')) > 1000 then
    raise exception 'Thông tin xác minh không hợp lệ.';
  end if;
  if p_review_status in ('verified','fixed') and char_length(btrim(coalesce(p_review_note,''))) < 5 then
    raise exception 'Cần ghi lý do hoặc bằng chứng xác minh (ít nhất 5 ký tự).';
  end if;
  insert into public.finance_monitor_reviews(issue_key,review_status,review_note,updated_by,updated_at)
  values(p_issue_key,p_review_status,coalesce(p_review_note,''),auth.uid(),now())
  on conflict (issue_key) do update set
    review_status=excluded.review_status,
    review_note=excluded.review_note,
    updated_by=excluded.updated_by,
    updated_at=now();
  return jsonb_build_object('success',true);
end;
$function$;
revoke all on function public.set_finance_monitor_review(text,text,text) from public,anon;
grant execute on function public.set_finance_monitor_review(text,text,text) to authenticated;

-- Turn the existing detector into a readable, branch-aware management view.
-- No ledger, receipt, or closing is modified.
create or replace function public.get_finance_monitor_v2(
  p_from date default null,
  p_to date default null,
  p_branch_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_from date := coalesce(p_from,(now() at time zone 'Asia/Ho_Chi_Minh')::date-6);
  v_to date := coalesce(p_to,(now() at time zone 'Asia/Ho_Chi_Minh')::date);
  v_raw jsonb;
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false)
     or not exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active)
  then
    raise exception using errcode='42501', message='Chỉ Admin đang hoạt động được xem giám sát tài chính.';
  end if;
  if v_from is null or v_to is null or v_to < v_from or
     v_to > (now() at time zone 'Asia/Ho_Chi_Minh')::date or v_to-v_from > 366 then
    raise exception 'Khoảng ngày giám sát không hợp lệ (tối đa 367 ngày).';
  end if;
  if p_branch_id is not null and not exists
      (select 1 from public.branches b where b.id=p_branch_id)
  then
    raise exception 'Cơ sở được chọn không tồn tại.';
  end if;

  v_raw := public.get_finance_audit(v_from,v_to);

  with raw_items as (
    select e.value as issue,
           e.value->>'issue_type' as issue_type,
           nullif(e.value->>'transaction_id','')::uuid as transaction_id,
           nullif(e.value->>'account_id','')::uuid as account_id,
           (e.value->>'business_date')::date as business_date
    from jsonb_array_elements(coalesce(v_raw->'issues','[]'::jsonb)) e(value)
    where e.value->>'issue_type' <> 'unclosed_day'
  ), enriched as (
    select
      r.*,
      coalesce(l.branch_id,t.branch_id,e.branch_id,rev.branch_id,c.branch_id) as branch_id,
      b.name as branch_name,
      a.name as account_name,
      l.description as ledger_description,
      l.source_type as ledger_source,
      coalesce(s.full_name, null::text) as student_name,
      fm.review_status, fm.review_note, fm.updated_at as reviewed_at,
      concat_ws(':',r.issue_type,coalesce(r.transaction_id::text,'none'),r.business_date::text,coalesce(r.account_id::text,'none')) as issue_key
    from raw_items r
    left join public.cash_ledger l on l.id=r.transaction_id
    left join public.tuition_payments tp on tp.id=r.transaction_id
    left join public.tuition t on t.id=tp.tuition_id
    left join public.students s on s.id=t.student_id
    left join public.expenses e on e.id=r.transaction_id
    left join public.other_revenues rev on rev.id=r.transaction_id
    left join public.daily_cash_closings c on c.id=r.transaction_id
    left join public.branches b on b.id=coalesce(l.branch_id,t.branch_id,e.branch_id,rev.branch_id,c.branch_id)
    left join public.cash_accounts a on a.id=coalesce(r.account_id,l.account_id)
    left join public.finance_monitor_reviews fm on fm.issue_key=concat_ws(':',r.issue_type,coalesce(r.transaction_id::text,'none'),r.business_date::text,coalesce(r.account_id::text,'none'))
    where p_branch_id is null or coalesce(l.branch_id,t.branch_id,e.branch_id,rev.branch_id,c.branch_id)=p_branch_id
  ), account_activity as (
    select l.business_date, l.branch_id, l.account_id, a.name account_name, b.name branch_name,
      count(*) as transaction_count,
      exists (
        select 1 from public.daily_cash_closings c
        where c.business_date=l.business_date and c.branch_id=l.branch_id
          and c.account_id=l.account_id
      ) as is_closed
    from public.cash_ledger l
    join public.branches b on b.id=l.branch_id and b.status::text='active'
    join public.cash_accounts a on a.id=l.account_id and a.is_active
    where l.business_date between v_from and least(v_to,(now() at time zone 'Asia/Ho_Chi_Minh')::date-1)
      and (p_branch_id is null or l.branch_id=p_branch_id)
    group by l.business_date,l.branch_id,l.account_id,a.name,b.name
  ), closing_days as (
    select business_date,branch_id,max(branch_name) branch_name,
      sum(transaction_count) transaction_count,
      count(*) filter(where not is_closed) pending_accounts,
      array_agg(account_name order by account_name) filter(where not is_closed) pending_account_names
    from account_activity
    group by business_date,branch_id
    having count(*) filter(where not is_closed)>0
  )
  select jsonb_build_object(
    'from',v_from,'to',v_to,
    'issues',coalesce((
      select jsonb_agg(
        e.issue || jsonb_build_object(
          'issue_key',e.issue_key,'branch_id',e.branch_id,'branch_name',e.branch_name,
          'account_name',e.account_name,'ledger_description',e.ledger_description,
          'ledger_source',e.ledger_source,'student_name',e.student_name,
          'review_status',coalesce(e.review_status,'unchecked'),
          'review_note',coalesce(e.review_note,''),
          'reviewed_at',e.reviewed_at
        ) order by e.business_date desc,e.issue_type
      ) from enriched e where e.issue_type <> 'reversal'
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(
        e.issue || jsonb_build_object(
          'branch_name',e.branch_name,'account_name',e.account_name,
          'ledger_description',e.ledger_description,'review_status',coalesce(e.review_status,'unchecked')
        ) order by e.business_date desc
      ) from enriched e where e.issue_type='reversal'
    ),'[]'::jsonb),
    'pending_closings',coalesce((
      select jsonb_agg(to_jsonb(d) order by d.business_date desc,d.branch_name)
      from closing_days d
    ),'[]'::jsonb),
    'ignored_empty_days',(
      select count(*) from (
        select b.id branch_id,a.id account_id,day.day::date business_date
        from public.branches b
        join public.cash_accounts a on a.is_active and (a.branch_id is null or a.branch_id=b.id)
        cross join lateral generate_series(v_from,least(v_to,(now() at time zone 'Asia/Ho_Chi_Minh')::date-1),'1 day'::interval) day(day)
        where b.status::text='active' and (p_branch_id is null or b.id=p_branch_id)
      ) pairs
      where not exists (select 1 from public.cash_ledger l where l.business_date=pairs.business_date and l.branch_id=pairs.branch_id and l.account_id=pairs.account_id)
    )
  ) into v_result;

  return v_result;
end;
$function$;
revoke all on function public.get_finance_monitor_v2(date,date,uuid) from public,anon;
grant execute on function public.get_finance_monitor_v2(date,date,uuid) to authenticated;

commit;