-- Review and apply this migration manually in Supabase. It is not applied by this project.
create table if not exists public.trial_class_leads (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null check (char_length(trim(parent_name)) between 1 and 160),
  child_name text not null check (char_length(trim(child_name)) between 1 and 160),
  child_age_or_birth_year text not null check (char_length(trim(child_age_or_birth_year)) between 1 and 40),
  phone text not null check (char_length(trim(phone)) between 8 and 40),
  class_id uuid null references public.classes(id) on delete set null,
  branch_id uuid null references public.branches(id) on delete set null,
  note text null check (char_length(note) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'trial_booked', 'converted', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.trial_class_leads enable row level security;

-- The public site can create a lead, but cannot read, alter, or delete any lead.
create policy "Public may submit trial class leads"
  on public.trial_class_leads for insert to anon, authenticated
  with check (status = 'new');

-- Dashboard access should be granted only through an authenticated staff policy
-- matching this project's profiles/roles model; it is intentionally not assumed here.
