-- Only an active Admin may remove an unpaid tuition record manually.
-- Managers still collect tuition, but cannot DELETE tuition or payment rows
-- through the Data API. Existing automatic lifecycle clean-up triggers remain.
drop policy if exists tuition_manager_delete on public.tuition;
drop policy if exists tuition_payments_manager_delete on public.tuition_payments;

create or replace function public.admin_delete_unpaid_tuition(p_tuition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tuition public.tuition%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Chỉ ADMIN đang hoạt động mới được xóa học phí.';
  end if;

  select * into v_tuition
    from public.tuition t
    where t.id = p_tuition_id
    for update;
  if not found then
    raise exception 'Không tìm thấy khoản học phí.';
  end if;

  if coalesce(v_tuition.amount_paid, 0) <> 0
     or exists (select 1 from public.tuition_payments tp where tp.tuition_id = p_tuition_id)
     or exists (
       select 1 from public.tuition_adjustments ta
       where ta.tuition_id = p_tuition_id or ta.target_tuition_id = p_tuition_id
     ) then
    raise exception 'Khoản này đã có tiền thu hoặc lịch sử xử lý; không được xóa.';
  end if;

  -- The existing audit_tuition DELETE trigger logs who deleted which record.
  delete from public.tuition where id = p_tuition_id;
end;
$function$;

revoke all on function public.admin_delete_unpaid_tuition(uuid) from public, anon;
grant execute on function public.admin_delete_unpaid_tuition(uuid) to authenticated;
