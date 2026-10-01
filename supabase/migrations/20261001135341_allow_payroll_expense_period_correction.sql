begin;

create or replace function private.finance_reject_source_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_type text := case tg_table_name
    when 'tuition_payments' then 'tuition_payment'
    when 'other_revenues' then 'other_revenue'
    else 'expense'
  end;
  v_id uuid := old.id;
  v_go_live timestamptz;
begin
  -- Allow only a payroll-period date correction on a verified generated
  -- expense, and only when every other expense field remains byte-for-byte
  -- equivalent. Ledger entries remain immutable and keep their cash date.
  if tg_op = 'UPDATE'
     and tg_table_name = 'expenses'
     and new.expense_date is distinct from old.expense_date
     and (to_jsonb(new) - 'expense_date') = (to_jsonb(old) - 'expense_date')
     and old.category = 'salary'
     and (coalesce(old.description, '') like 'Chi lương giáo viên - %'
       or coalesce(old.description, '') like 'Phụ cấp giáo viên - %')
     and exists (
       select 1
       from public.teacher_payrolls p
       where coalesce(old.note, '') like
         'Tự động từ bảng lương #' || p.id::text || '%'
         and new.expense_date = p.payroll_month
     ) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.id is distinct from old.id
     and exists (
       select 1 from public.cash_ledger l
       where l.source_type = v_type and l.source_id = old.id
     ) then
    raise exception using
      errcode = '55000',
      message = 'Không thể đổi mã giao dịch đã có trong sổ quỹ.';
  end if;

  if exists (
    select 1 from public.cash_ledger l
    where l.source_type = v_type and l.source_id = v_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'Giao dịch đã vào sổ quỹ; hãy lập bút toán đảo để giữ lịch sử.';
  end if;

  if tg_table_name in ('expenses', 'other_revenues') then
    select s.ledger_go_live_at
    into v_go_live
    from public.finance_ledger_settings s
    where s.singleton;

    if old.created_at < v_go_live then
      raise exception using
        errcode = '55000',
        message = 'Dữ liệu tài chính trước ngày mở sổ chỉ được xem, không thể sửa hoặc xóa.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function private.finance_reject_source_mutation()
  from public, anon, authenticated;

commit;
