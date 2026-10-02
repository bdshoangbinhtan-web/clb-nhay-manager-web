begin;

-- Run only after the H/A/S/V frontend is deployed. Stage one keeps the H
-- fallback so the older production frontend can continue writing transfers.
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
    v_transfer_account := coalesce(v_transfer_account, v_requested_account);
    if v_transfer_account is null or v_transfer_account not in ('H','A','S','V') then
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

commit;
