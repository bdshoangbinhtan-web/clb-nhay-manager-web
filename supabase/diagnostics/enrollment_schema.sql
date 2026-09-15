-- Read-only: run in the project's Supabase SQL Editor.
-- No student names, contacts, credentials, or enrollment rows are returned.
with related as (
  select c.oid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in
    ('class_students', 'classes', 'students', 'branches', 'attendance',
     'tuition', 'tuition_payments', 'tuition_adjustments', 'profiles',
     'activity_logs', 'audit_logs')
), triggers as (
  select t.* from pg_trigger t
  where t.tgrelid in (select oid from related) and not t.tgisinternal
)
select jsonb_pretty(jsonb_build_object(
  'columns', (select jsonb_agg(to_jsonb(x)) from (
    select table_schema, table_name, column_name, data_type, udt_name,
           is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'class_students'
    order by ordinal_position
  ) x),
  'constraints', (select jsonb_agg(to_jsonb(x)) from (
    select conrelid::regclass::text as table_name, conname, contype,
           pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid in (select oid from related)
       or confrelid = 'public.class_students'::regclass
  ) x),
  'indexes', (select jsonb_agg(to_jsonb(x)) from (
    select i.indrelid::regclass::text as table_name,
           pg_get_indexdef(i.indexrelid) as definition,
           i.indisunique, i.indisprimary, i.indisvalid
    from pg_index i where i.indrelid in (select oid from related)
  ) x),
  'rls', (select jsonb_agg(to_jsonb(x)) from (
    select oid::regclass::text as table_name, relrowsecurity, relforcerowsecurity
    from pg_class where oid in (select oid from related)
  ) x),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p
    where p.schemaname = 'public'),
  'triggers', (select jsonb_agg(to_jsonb(x)) from (
    select tgrelid::regclass::text as table_name, tgname, tgenabled,
           pg_get_triggerdef(oid) as definition,
           pg_get_functiondef(tgfoid) as function_definition
    from triggers
  ) x),
  'related_functions', (select jsonb_agg(to_jsonb(x)) from (
    select p.oid::regprocedure::text as function_name,
           pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.prosrc ilike '%class_students%'
        or p.proname in ('can_access_class', 'can_access_branch', 'my_role',
          'is_admin', 'is_admin_or_manager', 'is_current_user_admin',
          'is_angelbk_staff'))
  ) x)
)) as enrollment_schema;
