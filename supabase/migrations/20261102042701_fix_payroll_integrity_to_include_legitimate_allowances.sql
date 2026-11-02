begin;

-- Attendance bonuses and manual compensation for previous sessions which
-- could not be recorded are both valid parts of the payroll allowance.
create or replace function private.teacher_payroll_allowance(p_note text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $allowance$
declare
  v_meta jsonb;
  v_amount numeric;
begin
  if p_note is null or btrim(p_note) = '' then
    return 0;
  end if;

  begin
    v_meta := p_note::jsonb;
    if jsonb_typeof(v_meta) is distinct from 'object'
       or v_meta->>'kind' is distinct from 'abk_payroll_meta_v1' then
      return 0;
    end if;

    v_amount := (v_meta->>'allowance')::numeric;
    if v_amount is null or v_amount < 0 or v_amount::text = 'NaN' then
      return 0;
    end if;
    return v_amount;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      return 0;
  end;
end;
$allowance$;

revoke all on function private.teacher_payroll_allowance(text) from public, anon, authenticated;

-- Preserve the existing ten integrity checks and audit behavior.
-- PAY001 must compare the saved total against session details + allowance.
do $patch$
declare
  v_definition text;
  v_old_where constant text :=
    'where abs(p.total_amount - coalesce(d.detail_total, 0)) > 0.01';
  v_new_where constant text :=
    'where abs(p.total_amount - coalesce(d.detail_total, 0) - private.teacher_payroll_allowance(p.note)) > 0.01';
  v_old_select constant text :=
    'coalesce(d.detail_count, 0) as detail_count,';
begin
  select pg_get_functiondef('public.run_system_integrity_checks()'::regprocedure)
  into v_definition;

  if position(v_old_where in v_definition) = 0 then
    if position(v_new_where in v_definition) = 0 then
      raise exception 'Integrity checker definition has changed: PAY001 cannot be updated safely.';
    end if;
  else
    if position(v_old_select in v_definition) = 0 then
      raise exception 'Integrity checker definition has changed: PAY001 fields not found.';
    end if;

    v_definition := replace(
      v_definition,
      v_old_select,
      'coalesce(d.detail_count, 0) as detail_count, ' ||
        'private.teacher_payroll_allowance(p.note) as allowance,'
    );
    v_definition := replace(v_definition, v_old_where, v_new_where);
    v_definition := replace(
      v_definition,
      '''Teacher payroll total_amount khác tổng amount của payroll details.''',
      '''Tổng lương khác tổng tiền buổi dạy cộng phụ cấp hợp lệ.'''
    );
    execute v_definition;
  end if;
end;
$patch$;

-- Resolve historical alerts caused solely by legitimate allowances.
-- No changes to payrolls, attendance records, or payment transactions.
with detail_totals as (
  select payroll_id, sum(amount) as detail_total
  from public.teacher_payroll_details
  group by payroll_id
), reconciled as (
  select p.id
  from public.teacher_payrolls p
  left join detail_totals d on d.payroll_id = p.id
  where abs(
    p.total_amount
    - coalesce(d.detail_total, 0)
    - private.teacher_payroll_allowance(p.note)
  ) <= 0.01
)
update public.integrity_issues i
set status = 'resolved',
    resolved_at = now(),
    updated_at = now()
from reconciled r
where i.check_key = 'PAY001_PAYROLL_TOTAL_MISMATCH'
  and i.status = 'open'
  and i.entity_id = r.id;

commit;
