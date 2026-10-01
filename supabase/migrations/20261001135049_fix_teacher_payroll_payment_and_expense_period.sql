begin;

create or replace function public.pay_teacher_payroll_with_allowance(
  p_payroll_id uuid,
  p_payment_method text default 'cash'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_role text;
  v_user_branch uuid;
  v_payroll record;
  v_teacher_name text;
  v_detail_count integer;
  v_branch_count integer;
  v_detail_total numeric := 0;
  v_branch_id uuid;
  v_branch_amount numeric;
  v_allowance_branch_id uuid;
  v_expense_id text;
  v_expense_ids jsonb := '[]'::jsonb;
  v_method text;
  v_meta jsonb := '{}'::jsonb;
  v_allowance numeric := 0;
  v_allowance_note text;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập.';
  end if;

  select p.role, p.branch_id
  into v_user_role, v_user_branch
  from public.profiles p
  where p.id = auth.uid();

  if v_user_role is null then
    raise exception 'Không tìm thấy quyền người dùng.';
  end if;

  if v_user_role not in ('admin', 'manager') then
    raise exception 'Bạn không có quyền chi lương.';
  end if;

  v_method := lower(coalesce(p_payment_method, 'cash'));
  if v_method is null or v_method not in ('cash', 'transfer', 'unclassified') then
    raise exception 'Phương thức thanh toán không hợp lệ.';
  end if;

  select *
  into v_payroll
  from public.teacher_payrolls
  where id = p_payroll_id
  for update;

  if not found then
    raise exception 'Không tìm thấy bảng lương.';
  end if;

  if v_payroll.status = 'paid' then
    return jsonb_build_object(
      'success', false,
      'already_paid', true,
      'message', 'Bảng lương này đã được chi trước đó.',
      'payroll_id', p_payroll_id
    );
  end if;

  if v_payroll.status <> 'locked' then
    raise exception 'Chỉ được chi bảng lương đã chốt.';
  end if;

  if coalesce(v_payroll.note, '') <> '' then
    begin
      v_meta := v_payroll.note::jsonb;
    exception
      when others then
        v_meta := '{}'::jsonb;
    end;
  end if;

  if v_meta ->> 'kind' = 'abk_payroll_meta_v1' then
    begin
      v_allowance := greatest(
        coalesce(nullif(v_meta ->> 'allowance', '')::numeric, 0),
        0
      );
    exception
      when others then
        v_allowance := 0;
    end;

    v_allowance_note :=
      nullif(btrim(coalesce(v_meta ->> 'allowance_note', '')), '');
  end if;

  select t.full_name
  into v_teacher_name
  from public.teachers t
  where t.id = v_payroll.teacher_id;

  if v_teacher_name is null then
    raise exception 'Không tìm thấy giáo viên.';
  end if;

  select
    count(*),
    count(distinct c.branch_id),
    coalesce(sum(d.amount), 0)
  into
    v_detail_count,
    v_branch_count,
    v_detail_total
  from public.teacher_payroll_details d
  join public.classes c on c.id = d.class_id
  where d.payroll_id = p_payroll_id;

  if v_detail_count = 0 then
    raise exception 'Bảng lương chưa có chi tiết lớp.';
  end if;

  if abs((v_detail_total + v_allowance) - v_payroll.total_amount) > 0.01 then
    raise exception 'Tổng chi tiết + phụ cấp không khớp tổng lương.';
  end if;

  if v_user_role = 'manager' and exists (
    select 1
    from public.teacher_payroll_details d
    join public.classes c on c.id = d.class_id
    where d.payroll_id = p_payroll_id
      and c.branch_id <> v_user_branch
  ) then
    raise exception 'Bạn không có quyền chi lương cho cơ sở khác.';
  end if;

  -- Expenses belong to the payroll period. finance_post_expense records cash
  -- movement using the actual local payment date.
  for v_branch_id, v_branch_amount in
    select c.branch_id, sum(d.amount)
    from public.teacher_payroll_details d
    join public.classes c on c.id = d.class_id
    where d.payroll_id = p_payroll_id
    group by c.branch_id
  loop
    insert into public.expenses (
      branch_id, expense_date, category, description, amount,
      payment_method, note
    )
    values (
      v_branch_id,
      v_payroll.payroll_month,
      'salary',
      'Chi lương giáo viên - ' || v_teacher_name || ' - Tháng ' ||
        to_char(v_payroll.payroll_month, 'MM/YYYY'),
      v_branch_amount,
      v_method,
      'Tự động từ bảng lương #' || p_payroll_id::text ||
        ' | Phương thức: ' || case v_method
          when 'cash' then 'Tiền mặt'
          when 'transfer' then 'Chuyển khoản'
          else 'Chưa phân loại'
        end
    )
    returning id::text into v_expense_id;

    v_expense_ids := v_expense_ids || jsonb_build_array(v_expense_id);
  end loop;

  if v_allowance > 0 then
    if v_branch_count = 1 then
      select c.branch_id
      into v_allowance_branch_id
      from public.teacher_payroll_details d
      join public.classes c on c.id = d.class_id
      where d.payroll_id = p_payroll_id
      limit 1;
    else
      v_allowance_branch_id := null;
    end if;

    insert into public.expenses (
      branch_id, expense_date, category, description, amount,
      payment_method, note
    )
    values (
      v_allowance_branch_id,
      v_payroll.payroll_month,
      'salary',
      'Phụ cấp giáo viên - ' || v_teacher_name || ' - Tháng ' ||
        to_char(v_payroll.payroll_month, 'MM/YYYY'),
      v_allowance,
      v_method,
      'Tự động từ bảng lương #' || p_payroll_id::text ||
        case when v_allowance_note is not null
          then ' | ' || v_allowance_note else '' end ||
        ' | Phương thức: ' || case v_method
          when 'cash' then 'Tiền mặt'
          when 'transfer' then 'Chuyển khoản'
          else 'Chưa phân loại'
        end
    )
    returning id::text into v_expense_id;

    v_expense_ids := v_expense_ids || jsonb_build_array(v_expense_id);
  end if;

  update public.teacher_payrolls
  set status = 'paid',
      paid_at = now(),
      payment_method = v_method,
      expense_ids = v_expense_ids,
      updated_at = now()
  where id = p_payroll_id;

  return jsonb_build_object(
    'success', true,
    'already_paid', false,
    'payroll_id', p_payroll_id,
    'teacher_name', v_teacher_name,
    'amount', v_payroll.total_amount,
    'allowance', v_allowance,
    'payment_method', v_method,
    'expense_ids', v_expense_ids
  );
end;
$function$;

revoke all on function public.pay_teacher_payroll_with_allowance(uuid, text)
  from public, anon;
grant execute on function public.pay_teacher_payroll_with_allowance(uuid, text)
  to authenticated;

-- Guard the save/lock RPC as well: its definition is unchanged, while this
-- migration makes the intended callable roles explicit after function replace.
revoke all on function public.save_teacher_payroll_with_meta_atomic(
  uuid, date, text, jsonb, numeric, text
) from public, anon;
grant execute on function public.save_teacher_payroll_with_meta_atomic(
  uuid, date, text, jsonb, numeric, text
) to authenticated;

create or replace function private.finance_post_expense()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_method text := lower(nullif(btrim(coalesce(new.payment_method, '')), ''));
  v_account uuid;
  v_payroll_id_text text;
  v_is_payroll_expense boolean := false;
  v_business_date date;
begin
  -- New writes use expenses.payment_method. Keep note parsing only for legacy
  -- callers that do not yet populate that field.
  if v_method is null then
    if new.category = 'salary'
       and coalesce(new.description, '') like 'Chi lương giáo viên - %'
       and lower(coalesce(new.note, '')) like '%phương thức: chuyển khoản%' then
      v_method := 'transfer';
    elsif new.category = 'salary'
       and coalesce(new.description, '') like 'Chi lương giáo viên - %'
       and lower(coalesce(new.note, '')) like '%phương thức: tiền mặt%' then
      v_method := 'cash';
    elsif new.category = 'salary'
       and coalesce(new.description, '') like 'Phụ cấp giáo viên - %'
       and lower(coalesce(new.note, '')) like '%phương thức: chuyển khoản%' then
      v_method := 'transfer';
    elsif new.category = 'salary'
       and coalesce(new.description, '') like 'Phụ cấp giáo viên - %'
       and lower(coalesce(new.note, '')) like '%phương thức: tiền mặt%' then
      v_method := 'cash';
    end if;
  end if;

  if v_method is null or v_method not in ('cash', 'transfer', 'unclassified') then
    raise exception 'Hãy chọn tài khoản tiền mặt hoặc chuyển khoản.';
  end if;

  perform private.finance_require_actor(new.branch_id, true);
  v_account := private.finance_resolve_account(v_method, new.branch_id);

  -- The existing generated note contains an explicit payroll UUID. Verify
  -- it against teacher_payrolls before treating this as a payroll source.
  if new.category = 'salary'
     and (coalesce(new.description, '') like 'Chi lương giáo viên - %'
       or coalesce(new.description, '') like 'Phụ cấp giáo viên - %') then
    v_payroll_id_text := substring(
      coalesce(new.note, '') from
      '^Tự động từ bảng lương #([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'
    );
    if v_payroll_id_text is not null then
      select exists (
        select 1 from public.teacher_payrolls p
        where lower(p.id::text) = lower(v_payroll_id_text)
      ) into v_is_payroll_expense;
    end if;
  end if;

  v_business_date := case
    when v_is_payroll_expense
      then (pg_catalog.clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
    else new.expense_date
  end;

  perform private.finance_insert_ledger(
    v_business_date, v_account, 'out', new.amount, new.category,
    coalesce(new.description, new.category), new.branch_id, 'expense', new.id,
    jsonb_build_object('payment_method', v_method, 'note', new.note)
  );
  return new;
end;
$function$;

revoke all on function private.finance_post_expense()
  from public, anon, authenticated;

commit;
