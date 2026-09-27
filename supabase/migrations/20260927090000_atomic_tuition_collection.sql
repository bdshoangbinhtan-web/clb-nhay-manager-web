begin;

create or replace function public.collect_tuition_payment_atomic(
  p_student_id uuid,
  p_class_id uuid,
  p_billing_month date,
  p_amount_due numeric,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_profile_branch uuid;
  v_student public.students%rowtype;
  v_class public.classes%rowtype;
  v_tuition public.tuition%rowtype;
  v_billing_month date;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_payment_result jsonb;
  v_payment_date date;
  v_effective_due numeric;
  v_effective_paid numeric;
  v_remaining numeric;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập.';
  end if;

  select p.role, p.branch_id
    into v_role, v_profile_branch
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_role, '') not in ('admin', 'manager') then
    raise exception 'Bạn không có quyền thu học phí.';
  end if;

  if p_student_id is null or p_class_id is null or p_billing_month is null then
    raise exception 'Thiếu học viên, lớp hoặc kỳ học phí.';
  end if;

  if p_amount_due is null or p_amount_due < 0 then
    raise exception 'Số tiền học phí không hợp lệ.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Số tiền thực thu phải lớn hơn 0.';
  end if;

  if lower(coalesce(p_payment_method, '')) not in ('cash', 'transfer') then
    raise exception 'Phương thức thanh toán không hợp lệ.';
  end if;

  v_billing_month := date_trunc('month', p_billing_month)::date;
  v_payment_date := coalesce(p_payment_date, v_today);
  if v_payment_date <> v_today then
    raise exception 'Ngày thu phải là ngày hiện tại; chỉ được nhập kỳ học phí khác.';
  end if;

  select * into v_student
  from public.students s
  where s.id = p_student_id
  for update;

  if not found then
    raise exception 'Không tìm thấy học viên.';
  end if;

  select * into v_class
  from public.classes c
  where c.id = p_class_id
  for update;

  if not found then
    raise exception 'Không tìm thấy lớp.';
  end if;

  if v_role = 'manager' and v_profile_branch is distinct from v_class.branch_id then
    raise exception 'Bạn không có quyền thu học phí tại cơ sở này.';
  end if;

  if v_billing_month >= date_trunc('month', v_today)::date then
    if v_student.status is distinct from 'active'
       or v_class.status is distinct from 'active' then
      raise exception 'Học viên hoặc lớp hiện không hoạt động.';
    end if;

    perform 1
      from public.class_students cs
      where cs.student_id = p_student_id
        and cs.class_id = p_class_id
        and cs.status = 'active'
        and (cs.start_date is null or cs.start_date < (v_billing_month + interval '1 month')::date)
        and (cs.end_date is null or cs.end_date >= v_billing_month)
      for update;

    if not found then
      raise exception 'Học viên hiện không có lớp đang học phù hợp với kỳ này.';
    end if;
  end if;

  select * into v_tuition
  from public.tuition t
  where t.student_id = p_student_id
    and t.class_id = p_class_id
    and t.billing_month = v_billing_month
  for update;

  if not found then
    insert into public.tuition (
      student_id,
      class_id,
      branch_id,
      billing_month,
      description,
      amount_due,
      amount_paid,
      payment_date,
      note
    ) values (
      p_student_id,
      p_class_id,
      v_class.branch_id,
      v_billing_month,
      'Học phí ' || to_char(v_billing_month, 'MM/YYYY'),
      p_amount_due,
      0,
      null,
      nullif(trim(coalesce(p_note, '')), '')
    )
    on conflict (student_id, class_id, billing_month) do nothing
    returning * into v_tuition;

    if not found then
      select * into v_tuition
      from public.tuition t
      where t.student_id = p_student_id
        and t.class_id = p_class_id
        and t.billing_month = v_billing_month
      for update;
    end if;
  end if;

  if abs(coalesce(v_tuition.amount_due, 0) - p_amount_due) > 0.01 then
    raise exception 'Số học phí của kỳ này khác số tiền đã lưu. Cần kiểm tra khoản cũ trước khi thu.';
  end if;

  if nullif(trim(coalesce(p_note, '')), '') is not null
     and coalesce(v_tuition.note, '') not like '%' || trim(p_note) || '%' then
    update public.tuition
    set note = concat_ws(E'\n', nullif(note, ''), trim(p_note))
    where id = v_tuition.id;
  end if;

  select
    greatest(
      coalesce(v_tuition.amount_due, 0) - coalesce(sum(ta.amount) filter (where ta.action = 'cancel'), 0),
      0
    ),
    greatest(
      coalesce(v_tuition.amount_paid, 0),
      coalesce((
        select sum(tp.amount)
        from public.tuition_payments tp
        where tp.tuition_id = v_tuition.id
      ), 0)
    ) + coalesce(sum(ta.amount) filter (
      where ta.action = 'carry_forward' and ta.target_tuition_id = v_tuition.id
    ), 0)
  into v_effective_due, v_effective_paid
  from public.tuition_adjustments ta
  where ta.tuition_id = v_tuition.id
     or ta.target_tuition_id = v_tuition.id;

  v_remaining := greatest(v_effective_due - v_effective_paid, 0);
  if p_amount > v_remaining then
    raise exception 'Số tiền thực thu vượt quá số còn phải thu của kỳ.';
  end if;

  v_payment_result := public.record_tuition_payment_atomic(
    v_tuition.id,
    p_amount,
    lower(p_payment_method)
  );

  if coalesce(v_payment_result ->> 'success', 'true') = 'false'
     or nullif(v_payment_result ->> 'payment_id', '') is null then
    raise exception 'Máy chủ chưa xác nhận giao dịch thanh toán học phí.';
  end if;

  select * into v_tuition
  from public.tuition t
  where t.id = v_tuition.id;

  select
    greatest(
      coalesce(v_tuition.amount_due, 0) - coalesce(sum(ta.amount) filter (where ta.action = 'cancel'), 0),
      0
    ),
    greatest(
      coalesce(v_tuition.amount_paid, 0),
      coalesce((
        select sum(tp.amount)
        from public.tuition_payments tp
        where tp.tuition_id = v_tuition.id
      ), 0)
    ) + coalesce(sum(ta.amount) filter (
      where ta.action = 'carry_forward' and ta.target_tuition_id = v_tuition.id
    ), 0)
  into v_effective_due, v_effective_paid
  from public.tuition_adjustments ta
  where ta.tuition_id = v_tuition.id
     or ta.target_tuition_id = v_tuition.id;

  v_remaining := greatest(v_effective_due - v_effective_paid, 0);

  return jsonb_build_object(
    'success', true,
    'tuition_id', v_tuition.id,
    'billing_month', v_billing_month,
    'amount_due', v_tuition.amount_due,
    'effective_amount_due', v_effective_due,
    'amount_paid', v_tuition.amount_paid,
    'remaining_amount', v_remaining,
    'status', case when v_remaining <= 0 then 'paid' else 'partial' end,
    'payment_date', v_tuition.payment_date,
    'payment_result', v_payment_result
  );
end;
$function$;

revoke all on function public.collect_tuition_payment_atomic(
  uuid, uuid, date, numeric, numeric, text, date, text
) from public, anon;

grant execute on function public.collect_tuition_payment_atomic(
  uuid, uuid, date, numeric, numeric, text, date, text
) to authenticated;

commit;
