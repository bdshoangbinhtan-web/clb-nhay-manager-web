create or replace function public.get_cash_balances_as_of(p_business_date date, p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  perform private.finance_require_actor(p_branch_id, true);

  if p_business_date is null
     or p_business_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày xem số dư không hợp lệ.';
  end if;

  with account_balances as (
    select
      a.id as account_id,
      a.name,
      a.account_type,
      a.is_active,
      coalesce(
        sum(
          case l.direction
            when 'in' then l.amount
            else -l.amount
          end
        ),
        0
      ) as balance
    from public.cash_accounts a
    left join public.cash_ledger l
      on l.account_id = a.id
     and l.business_date <= p_business_date
     and (p_branch_id is null or l.branch_id = p_branch_id)
    where a.branch_id is null or a.branch_id = p_branch_id
    group by a.id, a.name, a.account_type, a.is_active
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'account_id', account_id,
        'name', name,
        'account_type', account_type,
        'is_active', is_active,
        'balance', balance
      )
      order by account_type, name
    ),
    '[]'::jsonb
  )
  into v_result
  from account_balances;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

revoke all on function public.get_cash_balances_as_of(date, uuid) from public, anon;
grant execute on function public.get_cash_balances_as_of(date, uuid) to authenticated;
