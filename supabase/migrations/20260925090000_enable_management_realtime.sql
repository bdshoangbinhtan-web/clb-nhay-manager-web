-- Enable targeted authenticated Realtime events for management data.
-- RLS remains unchanged and still determines which rows each client receives.

begin;

do $realtime$
declare
  v_table text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime does not exist';
  end if;

  foreach v_table in array array[
    'attendance',
    'branches',
    'class_sessions',
    'class_students',
    'class_teachers',
    'classes',
    'expenses',
    'other_revenues',
    'profiles',
    'students',
    'teacher_attendance',
    'teacher_payroll_details',
    'teacher_payrolls',
    'teacher_substitution_requests',
    'teacher_work_sessions',
    'teachers',
    'trial_class_leads',
    'trial_students',
    'tuition',
    'tuition_adjustments',
    'tuition_payments'
  ]
  loop
    if to_regclass('public.' || v_table) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = v_table
       )
    then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table
      );
    end if;
  end loop;
end
$realtime$;

commit;
