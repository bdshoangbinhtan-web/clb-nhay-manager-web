-- Apply after 20260910000000_create_trial_class_leads.sql.
-- This migration grants public submission only and restricts lead management to
-- existing staff roles in public.profiles (admin and manager).

grant usage on schema public to anon, authenticated;
grant insert on table public.trial_class_leads to anon, authenticated;
grant select, update on table public.trial_class_leads to authenticated;

create or replace function public.is_angelbk_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'manager')
  );
$$;

revoke all on function public.is_angelbk_staff() from public;
grant execute on function public.is_angelbk_staff() to authenticated;

create policy "Staff may view trial class leads"
  on public.trial_class_leads
  for select
  to authenticated
  using (public.is_angelbk_staff());

create policy "Staff may update trial class leads"
  on public.trial_class_leads
  for update
  to authenticated
  using (public.is_angelbk_staff())
  with check (public.is_angelbk_staff());

-- There is intentionally no public SELECT, UPDATE, or DELETE policy.
