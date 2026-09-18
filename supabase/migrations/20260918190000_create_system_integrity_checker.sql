begin;

create table if not exists public.integrity_check_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  started_by uuid references auth.users(id) on delete set null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  total_checks integer not null default 0 check (total_checks >= 0),
  passed_checks integer not null default 0 check (passed_checks >= 0),
  info_count integer not null default 0 check (info_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  critical_count integer not null default 0 check (critical_count >= 0),
  issue_count integer not null default 0 check (issue_count >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  check_results jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.integrity_issues (
  id uuid primary key default gen_random_uuid(),
  check_key text not null,
  category text not null,
  severity text not null
    check (severity in ('info', 'warning', 'error', 'critical')),
  title text not null,
  description text not null,
  entity_type text not null,
  entity_id uuid,
  related_entity_type text,
  related_entity_id uuid,
  branch_id uuid references public.branches(id) on delete set null,
  related_date date,
  context jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  status text not null default 'open'
    check (status in ('open', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  first_seen_run_id uuid not null
    references public.integrity_check_runs(id) on delete restrict,
  last_seen_run_id uuid not null
    references public.integrity_check_runs(id) on delete restrict,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integrity_issues_fingerprint_unique
on public.integrity_issues (fingerprint);

create index if not exists integrity_issues_status_severity_category_idx
on public.integrity_issues (status, severity, category, last_detected_at desc);

create index if not exists integrity_issues_entity_idx
on public.integrity_issues (entity_type, entity_id);

create index if not exists integrity_check_runs_started_at_idx
on public.integrity_check_runs (started_at desc);

create or replace function private.record_integrity_issue(
  p_run_id uuid,
  p_check_key text,
  p_category text,
  p_severity text,
  p_title text,
  p_description text,
  p_entity_type text,
  p_entity_id uuid,
  p_related_entity_type text,
  p_related_entity_id uuid,
  p_branch_id uuid,
  p_related_date date,
  p_context jsonb,
  p_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.integrity_issues (
    check_key,
    category,
    severity,
    title,
    description,
    entity_type,
    entity_id,
    related_entity_type,
    related_entity_id,
    branch_id,
    related_date,
    context,
    fingerprint,
    status,
    first_seen_run_id,
    last_seen_run_id
  )
  values (
    p_check_key,
    p_category,
    p_severity,
    p_title,
    p_description,
    p_entity_type,
    p_entity_id,
    p_related_entity_type,
    p_related_entity_id,
    p_branch_id,
    p_related_date,
    coalesce(p_context, '{}'::jsonb),
    p_fingerprint,
    'open',
    p_run_id,
    p_run_id
  )
  on conflict (fingerprint) do update
  set
    check_key = excluded.check_key,
    category = excluded.category,
    severity = excluded.severity,
    title = excluded.title,
    description = excluded.description,
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    related_entity_type = excluded.related_entity_type,
    related_entity_id = excluded.related_entity_id,
    branch_id = excluded.branch_id,
    related_date = excluded.related_date,
    context = excluded.context,
    status = 'open',
    last_detected_at = now(),
    resolved_at = null,
    last_seen_run_id = excluded.last_seen_run_id,
    occurrence_count = public.integrity_issues.occurrence_count + 1,
    updated_at = now();
end;
$function$;

revoke all on function private.record_integrity_issue(
  uuid, text, text, text, text, text, text, uuid, text, uuid, uuid, date,
  jsonb, text
) from public;

create or replace function public.run_system_integrity_checks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run_id uuid;
  v_started_at timestamptz := clock_timestamp();
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_passed integer := 0;
  v_info integer := 0;
  v_warning integer := 0;
  v_error integer := 0;
  v_critical integer := 0;
  v_issue_count integer := 0;
  v_check_keys text[] := array[
    'CS001_DUPLICATE_CLASS_SESSION',
    'TW001_TAUGHT_WITHOUT_WORK_SESSION',
    'TW002_WORK_SESSION_LINK_INVALID',
    'SUB001_SUBSTITUTE_WITHOUT_APPROVED_REQUEST',
    'SUB002_SUBSTITUTE_IDENTITY_MISMATCH',
    'TW003_DUPLICATE_WORK_SESSION',
    'SAL001_EFFECTIVE_SALARY_INVALID',
    'TUI001_TUITION_OVERPAID',
    'TUI002_PAYMENT_TOTAL_MISMATCH',
    'PAY001_PAYROLL_TOTAL_MISMATCH'
  ];
begin
  if not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Chỉ Admin được chạy kiểm tra sức khỏe dữ liệu.';
  end if;

  insert into public.integrity_check_runs (
    started_at,
    started_by,
    status,
    total_checks
  )
  values (
    v_started_at,
    auth.uid(),
    'running',
    cardinality(v_check_keys)
  )
  returning id into v_run_id;

  begin
    if not pg_try_advisory_xact_lock(
      hashtext('angel_bk_system_integrity_checker_v1')
    ) then
      raise exception 'Một lần kiểm tra khác đang chạy. Vui lòng thử lại sau.';
    end if;

    -- CS001: duplicate means the same class/date/start-time identity. The
    -- architecture intentionally permits two sessions on one day at
    -- different start times.
    with duplicates as (
      select
        cs.class_id,
        cs.session_date,
        cs.start_time,
        array_agg(cs.id order by cs.id) as session_ids,
        count(*) as duplicate_count
      from public.class_sessions cs
      group by cs.class_id, cs.session_date, cs.start_time
      having count(*) > 1
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'CS001_DUPLICATE_CLASS_SESSION',
        'class_sessions',
        'error',
        'Trùng buổi học cùng định danh',
        'Một lớp có nhiều class session cùng ngày và cùng giờ bắt đầu.',
        'class',
        d.class_id,
        'class_session',
        d.session_ids[1],
        c.branch_id,
        d.session_date,
        jsonb_build_object(
          'class_id', d.class_id,
          'class_name', c.name,
          'session_date', d.session_date,
          'start_time', d.start_time,
          'duplicate_count', d.duplicate_count,
          'class_session_ids', to_jsonb(d.session_ids)
        ),
        'CS001_DUPLICATE_CLASS_SESSION:' || d.class_id::text || ':' ||
          d.session_date::text || ':' || coalesce(d.start_time::text, 'NULL')
      )
      from duplicates d
      join public.classes c on c.id = d.class_id
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'CS001_DUPLICATE_CLASS_SESSION',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- TW001: payroll eligibility requires both taught attendance and a work
    -- session for the same actual teacher and class session.
    with candidates as (
      select
        ta.id,
        ta.class_session_id,
        ta.teacher_id,
        ta.class_id,
        ta.attendance_date,
        c.branch_id,
        c.name as class_name,
        t.full_name as teacher_name
      from public.teacher_attendance ta
      join public.classes c on c.id = ta.class_id
      join public.teachers t on t.id = ta.teacher_id
      where ta.status = 'taught'
        and not exists (
          select 1
          from public.teacher_work_sessions ws
          where ws.class_session_id = ta.class_session_id
            and ws.actual_teacher_id = ta.teacher_id
        )
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'TW001_TAUGHT_WITHOUT_WORK_SESSION',
        'teacher_payroll',
        'critical',
        'Đã xác nhận dạy nhưng thiếu buổi công',
        'Teacher attendance là taught nhưng không có work session khớp giáo viên thực dạy.',
        'teacher_attendance',
        x.id,
        'class_session',
        x.class_session_id,
        x.branch_id,
        x.attendance_date,
        jsonb_build_object(
          'teacher_attendance_id', x.id,
          'class_session_id', x.class_session_id,
          'teacher_id', x.teacher_id,
          'teacher_name', x.teacher_name,
          'class_id', x.class_id,
          'class_name', x.class_name,
          'attendance_date', x.attendance_date
        ),
        'TW001_TAUGHT_WITHOUT_WORK_SESSION:' || x.id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'TW001_TAUGHT_WITHOUT_WORK_SESSION',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- TW002: class/date/actual teacher must agree with the linked session.
    with candidates as (
      select
        ws.id,
        ws.class_session_id,
        ws.class_id,
        ws.session_date,
        ws.actual_teacher_id,
        cs.class_id as session_class_id,
        cs.session_date as linked_session_date,
        cs.actual_teacher_id as session_actual_teacher_id,
        c.branch_id,
        c.name as class_name,
        t.full_name as teacher_name
      from public.teacher_work_sessions ws
      left join public.class_sessions cs on cs.id = ws.class_session_id
      join public.classes c on c.id = ws.class_id
      join public.teachers t on t.id = ws.actual_teacher_id
      where cs.id is null
         or ws.class_id <> cs.class_id
         or ws.session_date <> cs.session_date
         or ws.actual_teacher_id is distinct from cs.actual_teacher_id
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'TW002_WORK_SESSION_LINK_INVALID',
        'teacher_payroll',
        'critical',
        'Buổi công thiếu hoặc sai class session',
        'Teacher work session không có class session hoặc không khớp lớp, ngày, giáo viên thực dạy.',
        'teacher_work_session',
        x.id,
        'class_session',
        x.class_session_id,
        x.branch_id,
        x.session_date,
        to_jsonb(x),
        'TW002_WORK_SESSION_LINK_INVALID:' || x.id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'TW002_WORK_SESSION_LINK_INVALID',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- SUB001: substitute work is only valid when it references an approved
    -- substitution request.
    with candidates as (
      select
        ws.id,
        ws.class_session_id,
        ws.substitution_request_id,
        ws.class_id,
        ws.session_date,
        ws.actual_teacher_id,
        r.status as request_status,
        c.branch_id,
        c.name as class_name,
        t.full_name as teacher_name
      from public.teacher_work_sessions ws
      left join public.teacher_substitution_requests r
        on r.id = ws.substitution_request_id
      join public.classes c on c.id = ws.class_id
      join public.teachers t on t.id = ws.actual_teacher_id
      where ws.teaching_type = 'substitute'
        and (r.id is null or r.status <> 'approved')
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'SUB001_SUBSTITUTE_WITHOUT_APPROVED_REQUEST',
        'substitution',
        'critical',
        'Buổi dạy thay thiếu yêu cầu đã duyệt',
        'Work session dạy thay không tham chiếu một yêu cầu dạy thay approved.',
        'teacher_work_session',
        x.id,
        'substitution_request',
        x.substitution_request_id,
        x.branch_id,
        x.session_date,
        to_jsonb(x),
        'SUB001_SUBSTITUTE_WITHOUT_APPROVED_REQUEST:' || x.id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'SUB001_SUBSTITUTE_WITHOUT_APPROVED_REQUEST',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- SUB002: compare only immutable request/session facts, never the current
    -- class-teacher assignment.
    with candidates as (
      select
        ws.id,
        ws.class_session_id,
        ws.substitution_request_id,
        ws.class_id,
        ws.session_date,
        ws.standing_teacher_id,
        ws.actual_teacher_id,
        r.class_id as request_class_id,
        r.session_date as request_session_date,
        r.standing_teacher_id as request_standing_teacher_id,
        r.substitute_teacher_id,
        cs.substitution_request_id as session_substitution_request_id,
        c.branch_id,
        c.name as class_name,
        t.full_name as actual_teacher_name
      from public.teacher_work_sessions ws
      join public.teacher_substitution_requests r
        on r.id = ws.substitution_request_id
       and r.status = 'approved'
      left join public.class_sessions cs on cs.id = ws.class_session_id
      join public.classes c on c.id = ws.class_id
      join public.teachers t on t.id = ws.actual_teacher_id
      where ws.teaching_type = 'substitute'
        and (
          ws.class_id <> r.class_id
          or ws.session_date <> r.session_date
          or ws.standing_teacher_id <> r.standing_teacher_id
          or ws.actual_teacher_id <> r.substitute_teacher_id
          or cs.substitution_request_id is distinct from r.id
        )
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'SUB002_SUBSTITUTE_IDENTITY_MISMATCH',
        'substitution',
        'critical',
        'Giáo viên dạy thay không khớp yêu cầu',
        'Lớp, ngày hoặc cặp giáo viên giữa work session, class session và approved request không khớp.',
        'teacher_work_session',
        x.id,
        'substitution_request',
        x.substitution_request_id,
        x.branch_id,
        x.session_date,
        to_jsonb(x),
        'SUB002_SUBSTITUTE_IDENTITY_MISMATCH:' || x.id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'SUB002_SUBSTITUTE_IDENTITY_MISMATCH',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- TW003 is also protected by a partial unique index. The check remains as
    -- a visible invariant for legacy/manual-imported data.
    with duplicates as (
      select
        ws.class_session_id,
        array_agg(ws.id order by ws.id) as work_session_ids,
        array_agg(distinct ws.actual_teacher_id) as actual_teacher_ids,
        count(*) as work_session_count
      from public.teacher_work_sessions ws
      where ws.class_session_id is not null
      group by ws.class_session_id
      having count(*) > 1
    ), candidates as (
      select
        d.*,
        cs.class_id,
        cs.session_date,
        cs.branch_id,
        c.name as class_name
      from duplicates d
      join public.class_sessions cs on cs.id = d.class_session_id
      join public.classes c on c.id = cs.class_id
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'TW003_DUPLICATE_WORK_SESSION',
        'teacher_payroll',
        'critical',
        'Một buổi học có nhiều work session',
        'Một class session đang gắn với nhiều teacher work session hoặc nhiều giáo viên thực dạy.',
        'class_session',
        x.class_session_id,
        'teacher_work_session',
        x.work_session_ids[1],
        x.branch_id,
        x.session_date,
        to_jsonb(x),
        'TW003_DUPLICATE_WORK_SESSION:' || x.class_session_id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'TW003_DUPLICATE_WORK_SESSION',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- SAL001: historical rows intentionally keep a NULL dedicated work
    -- snapshot. Their immutable class-session snapshot or calculated_amount is
    -- a valid fallback and prevents false positives.
    with candidates as (
      select
        ws.id,
        ws.class_session_id,
        ws.class_id,
        ws.session_date,
        ws.actual_teacher_id,
        ws.class_salary_per_session_snapshot as work_snapshot,
        cs.salary_rate_snapshot as session_snapshot,
        ws.calculated_amount as legacy_calculated_amount,
        coalesce(
          ws.class_salary_per_session_snapshot,
          cs.salary_rate_snapshot,
          ws.calculated_amount
        ) as effective_salary,
        c.branch_id,
        c.name as class_name,
        t.full_name as teacher_name
      from public.teacher_work_sessions ws
      join public.class_sessions cs on cs.id = ws.class_session_id
      join public.classes c on c.id = ws.class_id
      join public.teachers t on t.id = ws.actual_teacher_id
      where exists (
          select 1
          from public.teacher_attendance ta
          where ta.class_session_id = ws.class_session_id
            and ta.teacher_id = ws.actual_teacher_id
            and ta.status = 'taught'
        )
        and (
          coalesce(
            ws.class_salary_per_session_snapshot,
            cs.salary_rate_snapshot,
            ws.calculated_amount
          ) is null
          or coalesce(
            ws.class_salary_per_session_snapshot,
            cs.salary_rate_snapshot,
            ws.calculated_amount
          ) <= 0
        )
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'SAL001_EFFECTIVE_SALARY_INVALID',
        'teacher_payroll',
        'error',
        'Buổi dạy không có mức lương hợp lệ',
        'Buổi đủ điều kiện tính lương nhưng snapshot/calculated amount hiệu lực không lớn hơn 0.',
        'teacher_work_session',
        x.id,
        'class_session',
        x.class_session_id,
        x.branch_id,
        x.session_date,
        to_jsonb(x),
        'SAL001_EFFECTIVE_SALARY_INVALID:' || x.id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'SAL001_EFFECTIVE_SALARY_INVALID',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- TUI001: the current payment RPC refuses overpayment; no credit/refund
    -- field exists in this schema.
    with candidates as (
      select
        tu.id,
        tu.student_id,
        tu.class_id,
        tu.branch_id,
        tu.billing_month,
        tu.amount_due,
        tu.amount_paid,
        s.full_name as student_name,
        c.name as class_name
      from public.tuition tu
      join public.students s on s.id = tu.student_id
      left join public.classes c on c.id = tu.class_id
      where tu.amount_paid > tu.amount_due
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'TUI001_TUITION_OVERPAID',
        'tuition',
        'critical',
        'Số tiền đã thu vượt số phải thu',
        'Tuition.amount_paid lớn hơn tuition.amount_due.',
        'tuition',
        x.id,
        'student',
        x.student_id,
        x.branch_id,
        x.billing_month,
        to_jsonb(x),
        'TUI001_TUITION_OVERPAID:' || x.id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'TUI001_TUITION_OVERPAID',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- TUI002: tuition_payments has no void/refund/credit rows; every ledger
    -- amount is positive, so SUM is the safe source for this reconciliation.
    with payment_totals as (
      select
        p.tuition_id,
        sum(p.amount) as payment_total,
        count(*) as payment_count,
        jsonb_agg(jsonb_build_object(
          'payment_id', p.id,
          'receipt_no', p.receipt_no,
          'amount', p.amount,
          'payment_date', p.payment_date
        ) order by p.created_at) as payments
      from public.tuition_payments p
      group by p.tuition_id
    ), candidates as (
      select
        tu.id,
        tu.student_id,
        tu.class_id,
        tu.branch_id,
        tu.billing_month,
        tu.amount_due,
        tu.amount_paid,
        coalesce(pt.payment_total, 0) as payment_total,
        coalesce(pt.payment_count, 0) as payment_count,
        coalesce(pt.payments, '[]'::jsonb) as payments,
        s.full_name as student_name,
        c.name as class_name
      from public.tuition tu
      left join payment_totals pt on pt.tuition_id = tu.id
      join public.students s on s.id = tu.student_id
      left join public.classes c on c.id = tu.class_id
      where abs(tu.amount_paid - coalesce(pt.payment_total, 0)) > 0.01
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'TUI002_PAYMENT_TOTAL_MISMATCH',
        'tuition',
        'critical',
        'Tổng phiếu thu không khớp học phí',
        'SUM(tuition_payments.amount) khác tuition.amount_paid.',
        'tuition',
        x.id,
        'student',
        x.student_id,
        x.branch_id,
        x.billing_month,
        to_jsonb(x),
        'TUI002_PAYMENT_TOTAL_MISMATCH:' || x.id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'TUI002_PAYMENT_TOTAL_MISMATCH',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- PAY001: detail.amount already contains the approved override, so the
    -- persisted header must equal the detail sum exactly within one cent.
    with detail_totals as (
      select
        d.payroll_id,
        sum(d.amount) as detail_total,
        count(*) as detail_count
      from public.teacher_payroll_details d
      group by d.payroll_id
    ), candidates as (
      select
        p.id,
        p.teacher_id,
        p.payroll_month,
        p.total_amount,
        p.total_sessions,
        p.status,
        coalesce(d.detail_total, 0) as detail_total,
        coalesce(d.detail_count, 0) as detail_count,
        t.full_name as teacher_name
      from public.teacher_payrolls p
      left join detail_totals d on d.payroll_id = p.id
      join public.teachers t on t.id = p.teacher_id
      where abs(p.total_amount - coalesce(d.detail_total, 0)) > 0.01
    ), recorded as (
      select private.record_integrity_issue(
        v_run_id,
        'PAY001_PAYROLL_TOTAL_MISMATCH',
        'teacher_payroll',
        'critical',
        'Tổng bảng lương không khớp chi tiết',
        'Teacher payroll total_amount khác tổng amount của payroll details.',
        'teacher_payroll',
        x.id,
        'teacher',
        x.teacher_id,
        null,
        x.payroll_month,
        to_jsonb(x),
        'PAY001_PAYROLL_TOTAL_MISMATCH:' || x.id::text
      )
      from candidates x
    )
    select count(*) into v_count from recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', 'PAY001_PAYROLL_TOTAL_MISMATCH',
      'status', case when v_count = 0 then 'passed' else 'failed' end,
      'issues', v_count
    ));
    if v_count = 0 then v_passed := v_passed + 1; end if;

    -- Resolve only after every V1 check above completed successfully. An
    -- exception jumps to the handler and rolls this nested block back, so a
    -- failed run can never resolve old issues.
    update public.integrity_issues
    set
      status = 'resolved',
      resolved_at = now(),
      updated_at = now()
    where status = 'open'
      and check_key = any(v_check_keys)
      and last_seen_run_id is distinct from v_run_id;

    select
      count(*) filter (where severity = 'info'),
      count(*) filter (where severity = 'warning'),
      count(*) filter (where severity = 'error'),
      count(*) filter (where severity = 'critical'),
      count(*)
    into v_info, v_warning, v_error, v_critical, v_issue_count
    from public.integrity_issues
    where last_seen_run_id = v_run_id;

    update public.integrity_check_runs
    set
      finished_at = clock_timestamp(),
      status = 'completed',
      passed_checks = v_passed,
      info_count = v_info,
      warning_count = v_warning,
      error_count = v_error,
      critical_count = v_critical,
      issue_count = v_issue_count,
      duration_ms = greatest(
        0,
        round(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer
      ),
      check_results = v_results,
      error_message = null
    where id = v_run_id;

    return jsonb_build_object(
      'success', true,
      'run_id', v_run_id,
      'status', 'completed',
      'passed_checks', v_passed,
      'total_checks', cardinality(v_check_keys),
      'issue_count', v_issue_count
    );
  exception
    when others then
      update public.integrity_check_runs
      set
        finished_at = clock_timestamp(),
        status = 'failed',
        duration_ms = greatest(
          0,
          round(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer
        ),
        check_results = v_results,
        error_message = sqlerrm
      where id = v_run_id;

      return jsonb_build_object(
        'success', false,
        'run_id', v_run_id,
        'status', 'failed',
        'error_message', sqlerrm
      );
  end;
end;
$function$;

revoke all on function public.run_system_integrity_checks()
from public, anon;
grant execute on function public.run_system_integrity_checks()
to authenticated;

create or replace function public.get_system_integrity_dashboard(
  p_issue_status text default 'open',
  p_severity text default null,
  p_category text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 10), 100);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Chỉ Admin được xem kiểm tra sức khỏe dữ liệu.';
  end if;

  if p_issue_status not in ('open', 'resolved', 'all') then
    raise exception using errcode = '22023', message = 'Trạng thái issue không hợp lệ.';
  end if;

  if p_severity is not null
     and p_severity not in ('info', 'warning', 'error', 'critical')
  then
    raise exception using errcode = '22023', message = 'Mức độ issue không hợp lệ.';
  end if;

  if p_category is not null
     and p_category not in ('class_sessions', 'teacher_payroll', 'substitution', 'tuition')
  then
    raise exception using errcode = '22023', message = 'Nhóm issue không hợp lệ.';
  end if;

  with filtered as materialized (
    select
      i.*,
      b.name as branch_name
    from public.integrity_issues i
    left join public.branches b on b.id = i.branch_id
    where (p_issue_status = 'all' or i.status = p_issue_status)
      and (p_severity is null or i.severity = p_severity)
      and (p_category is null or i.category = p_category)
  ), issue_page as (
    select *
    from filtered
    order by
      case severity
        when 'critical' then 1
        when 'error' then 2
        when 'warning' then 3
        else 4
      end,
      last_detected_at desc,
      id desc
    limit v_page_size
    offset (v_page - 1) * v_page_size
  ), issue_stats as (
    select
      count(*) as total,
      count(*) filter (where severity = 'info') as info_count,
      count(*) filter (where severity = 'warning') as warning_count,
      count(*) filter (where severity = 'error') as error_count,
      count(*) filter (where severity = 'critical') as critical_count
    from filtered
  )
  select jsonb_build_object(
    'latest_run', (
      select to_jsonb(r)
      from public.integrity_check_runs r
      order by r.started_at desc, r.id desc
      limit 1
    ),
    'issues', coalesce((
      select jsonb_agg(to_jsonb(p) order by
        case p.severity
          when 'critical' then 1
          when 'error' then 2
          when 'warning' then 3
          else 4
        end,
        p.last_detected_at desc,
        p.id desc
      )
      from issue_page p
    ), '[]'::jsonb),
    'issue_stats', jsonb_build_object(
      'total', s.total,
      'info_count', s.info_count,
      'warning_count', s.warning_count,
      'error_count', s.error_count,
      'critical_count', s.critical_count
    ),
    'history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.started_at desc, h.id desc)
      from (
        select *
        from public.integrity_check_runs
        order by started_at desc, id desc
        limit 30
      ) h
    ), '[]'::jsonb),
    'page', v_page,
    'page_size', v_page_size,
    'has_more', s.total > v_page * v_page_size
  )
  into v_result
  from issue_stats s;

  return v_result;
end;
$function$;

revoke all on function public.get_system_integrity_dashboard(
  text, text, text, integer, integer
) from public, anon;
grant execute on function public.get_system_integrity_dashboard(
  text, text, text, integer, integer
) to authenticated;

alter table public.integrity_check_runs enable row level security;
alter table public.integrity_issues enable row level security;

drop policy if exists "Admins can view integrity check runs"
on public.integrity_check_runs;
create policy "Admins can view integrity check runs"
on public.integrity_check_runs
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can view integrity issues"
on public.integrity_issues;
create policy "Admins can view integrity issues"
on public.integrity_issues
for select
to authenticated
using (public.is_admin());

revoke all on public.integrity_check_runs from anon, authenticated;
revoke all on public.integrity_issues from anon, authenticated;
grant select on public.integrity_check_runs to authenticated;
grant select on public.integrity_issues to authenticated;

comment on table public.integrity_check_runs is
  'Admin-only history of read-only business data integrity scans.';
comment on table public.integrity_issues is
  'Persistent open/resolved integrity findings deduplicated by stable fingerprint.';
comment on function public.run_system_integrity_checks() is
  'Runs ten read-only business checks. It only writes integrity_check_runs and integrity_issues and never auto-fixes business data.';

commit;
