begin;

-- Additive payroll feature only:
-- - no table/column changes
-- - no backfill
-- - no existing payroll rows are changed by this migration
-- New metadata reuses the existing teacher_payrolls.note and
-- teacher_payroll_details.note columns.

create or replace function public.save_teacher_payroll_with_meta_atomic(
  p_teacher_id uuid,
  p_payroll_month date,
  p_target_status text,
  p_details jsonb,
  p_allowance numeric default 0,
  p_allowance_note text default null
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_result jsonb;
  v_payroll_id uuid;
  v_detail jsonb;
  v_class_id uuid;
  v_attendance_date date;
  v_detail_note text;
  v_allowance numeric := coalesce(p_allowance, 0);
  v_allowance_note text := nullif(btrim(coalesce(p_allowance_note, '')), '');
  v_base_total numeric := 0;
  v_total_amount numeric := 0;
begin
  if v_allowance < 0 then
    raise exception 'Phụ cấp không được âm.';
  end if;

  -- Reuse the existing, proven payroll save/lock validation and detail logic.
  v_result := public.save_teacher_payroll_atomic(
    p_teacher_id,
    p_payroll_month,
    p_target_status,
    p_details
  );

  if coalesce((v_result ->> 'already_locked')::boolean, false) then
    return v_result;
  end if;

  v_payroll_id := nullif(v_result ->> 'payroll_id', '')::uuid;

  if v_payroll_id is null then
    raise exception 'Máy chủ không trả về mã bảng lương.';
  end if;

  -- Notes only belong to rows that are actually overridden.
  for v_detail in
    select value from jsonb_array_elements(p_details)
  loop
    v_class_id := nullif(btrim(v_detail ->> 'class_id'), '')::uuid;
    v_attendance_date :=
      nullif(btrim(v_detail ->> 'attendance_date'), '')::date;
    v_detail_note := nullif(btrim(coalesce(v_detail ->> 'note', '')), '');

    update public.teacher_payroll_details d
    set note = case when d.amount_override then v_detail_note else null end
    where d.payroll_id = v_payroll_id
      and d.class_id = v_class_id
      and d.attendance_date = v_attendance_date
      and d.teacher_id = p_teacher_id;
  end loop;

  select coalesce(p.total_amount, 0)
  into v_base_total
  from public.teacher_payrolls p
  where p.id = v_payroll_id
  for update;

  if not found then
    raise exception 'Không tìm thấy bảng lương vừa lưu.';
  end if;

  v_total_amount := v_base_total + v_allowance;

  update public.teacher_payrolls
  set
    total_amount = v_total_amount,
    note = case
      when v_allowance > 0 or v_allowance_note is not null then
        jsonb_build_object(
          'kind', 'abk_payroll_meta_v1',
          'allowance', v_allowance,
          'allowance_note', v_allowance_note
        )::text
      else null
    end,
    updated_at = now()
  where id = v_payroll_id;

  return v_result || jsonb_build_object(
    'allowance', v_allowance,
    'allowance_note', v_allowance_note,
    'total_amount', v_total_amount
  );
end;
$function$;

revoke all on function public.save_teacher_payroll_with_meta_atomic(
  uuid, date, text, jsonb, numeric, text
) from public;

grant execute on function public.save_teacher_payroll_with_meta_atomic(
  uuid, date, text, jsonb, numeric, text
) to authenticated;


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

  if v_method not in ('cash', 'transfer', 'unclassified') then
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
  join public.classes c
    on c.id = d.class_id
  where d.payroll_id = p_payroll_id;

  if v_detail_count = 0 then
    raise exception 'Bảng lương chưa có chi tiết lớp.';
  end if;

  if abs((v_detail_total + v_allowance) - v_payroll.total_amount) > 0.01 then
    raise exception 'Tổng chi tiết + phụ cấp không khớp tổng lương.';
  end if;

  if v_user_role = 'manager' then
    if exists (
      select 1
      from public.teacher_payroll_details d
      join public.classes c
        on c.id = d.class_id
      where d.payroll_id = p_payroll_id
        and c.branch_id <> v_user_branch
    ) then
      raise exception 'Bạn không có quyền chi lương cho cơ sở khác.';
    end if;
  end if;

  -- Base teaching salary keeps the exact existing per-branch behavior.
  for v_branch_id, v_branch_amount in
    select c.branch_id, sum(d.amount)
    from public.teacher_payroll_details d
    join public.classes c
      on c.id = d.class_id
    where d.payroll_id = p_payroll_id
    group by c.branch_id
  loop
    insert into public.expenses (
      branch_id,
      expense_date,
      category,
      description,
      amount,
      note
    )
    values (
      v_branch_id,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,
      'salary',
      'Chi lương giáo viên - ' ||
        v_teacher_name ||
        ' - Tháng ' ||
        to_char(v_payroll.payroll_month, 'MM/YYYY'),
      v_branch_amount,
      'Tự động từ bảng lương #' ||
        p_payroll_id::text ||
        ' | Phương thức: ' ||
        case v_method
          when 'cash' then 'Tiền mặt'
          when 'transfer' then 'Chuyển khoản'
          else 'Chưa phân loại'
        end
    )
    returning id::text into v_expense_id;

    v_expense_ids :=
      v_expense_ids || jsonb_build_array(v_expense_id);
  end loop;

  -- Allowance is a separate salary expense so session amounts stay untouched.
  if v_allowance > 0 then
    if v_branch_count = 1 then
      select c.branch_id
      into v_allowance_branch_id
      from public.teacher_payroll_details d
      join public.classes c
        on c.id = d.class_id
      where d.payroll_id = p_payroll_id
      limit 1;
    else
      -- If an Admin payroll spans multiple branches, keep the allowance
      -- unassigned rather than arbitrarily charging one branch.
      v_allowance_branch_id := null;
    end if;

    insert into public.expenses (
      branch_id,
      expense_date,
      category,
      description,
      amount,
      note
    )
    values (
      v_allowance_branch_id,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,
      'salary',
      'Phụ cấp giáo viên - ' ||
        v_teacher_name ||
        ' - Tháng ' ||
        to_char(v_payroll.payroll_month, 'MM/YYYY'),
      v_allowance,
      'Tự động từ bảng lương #' ||
        p_payroll_id::text ||
        case
          when v_allowance_note is not null
            then ' | ' || v_allowance_note
          else ''
        end ||
        ' | Phương thức: ' ||
        case v_method
          when 'cash' then 'Tiền mặt'
          when 'transfer' then 'Chuyển khoản'
          else 'Chưa phân loại'
        end
    )
    returning id::text into v_expense_id;

    v_expense_ids :=
      v_expense_ids || jsonb_build_array(v_expense_id);
  end if;

  update public.teacher_payrolls
  set
    status = 'paid',
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

revoke all on function public.pay_teacher_payroll_with_allowance(
  uuid, text
) from public;

grant execute on function public.pay_teacher_payroll_with_allowance(
  uuid, text
) to authenticated;

commit;
