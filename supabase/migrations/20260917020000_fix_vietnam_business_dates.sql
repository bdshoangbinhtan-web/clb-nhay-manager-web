-- Chuẩn hóa ngày nghiệp vụ DB theo Asia/Ho_Chi_Minh.
-- Timestamp như paid_at / updated_at vẫn giữ timestamptz UTC.

create or replace function public.generate_receipt_no()
returns trigger
language plpgsql
as $function$
begin
  if new.receipt_no is null or trim(new.receipt_no) = '' then
    new.receipt_no :=
      'PT-' ||
      to_char(
        coalesce(
          new.payment_date,
          (now() at time zone 'Asia/Ho_Chi_Minh')::date
        ),
        'YYYYMMDD'
      ) ||
      '-' ||
      lpad(nextval('public.receipt_no_seq')::text, 4, '0');
  end if;

  return new;
end;
$function$;


create or replace function public.pay_teacher_payroll(
  p_payroll_id uuid,
  p_payment_method text default 'cash'::text
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

  v_expense_id text;
  v_expense_ids jsonb := '[]'::jsonb;

  v_method text;
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

  if abs(v_detail_total - v_payroll.total_amount) > 0.01 then
    raise exception
      'Tổng chi tiết bảng lương không khớp tổng lương.';
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
      raise exception
        'Bạn không có quyền chi lương cho cơ sở khác.';
    end if;
  end if;

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
    'payment_method', v_method,
    'expense_ids', v_expense_ids
  );
end;
$function$;
