-- Keep exactly one canonical substitution request per substitute/class/date.
--
-- Historical duplicates are retained for auditability and linked to the
-- canonical request. New client writes cannot create or nominate duplicate
-- rows, and the partial unique index closes concurrent double-click races.
begin;

alter table public.teacher_substitution_requests
  add column if not exists duplicate_of_id uuid;

with ranked as (
  select
    r.id,
    first_value(r.id) over (
      partition by r.substitute_teacher_id, r.class_id, r.session_date
      order by
        case
          when exists (
            select 1
            from public.teacher_work_sessions ws
            where ws.substitution_request_id = r.id
          ) then 0
          when r.status = 'approved' then 1
          when r.status = 'pending' then 2
          when r.status = 'rejected' then 3
          else 4
        end,
        r.created_at asc nulls last,
        r.id
    ) as canonical_id
  from public.teacher_substitution_requests r
), duplicates as (
  select id, canonical_id
  from ranked
  where id <> canonical_id
)
update public.teacher_substitution_requests r
set
  duplicate_of_id = d.canonical_id,
  status = case
    when r.status in ('pending', 'approved') then 'cancelled'
    else r.status
  end,
  note = concat_ws(
    ' ',
    nullif(btrim(r.note), ''),
    '[Hệ thống lưu bản trùng cũ; yêu cầu chính:',
    d.canonical_id::text || ']'
  )
from duplicates d
where r.id = d.id
  and r.duplicate_of_id is null;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.teacher_substitution_requests'::regclass
      and conname = 'teacher_substitution_requests_duplicate_of_id_fkey'
  ) then
    alter table public.teacher_substitution_requests
      add constraint teacher_substitution_requests_duplicate_of_id_fkey
      foreign key (duplicate_of_id)
      references public.teacher_substitution_requests(id)
      on delete restrict
      not valid;
  end if;
end
$constraint$;

alter table public.teacher_substitution_requests
  validate constraint teacher_substitution_requests_duplicate_of_id_fkey;

create index if not exists teacher_substitution_requests_duplicate_of_idx
  on public.teacher_substitution_requests (duplicate_of_id)
  where duplicate_of_id is not null;

create unique index if not exists teacher_substitution_requests_one_per_class_day
  on public.teacher_substitution_requests (
    substitute_teacher_id,
    class_id,
    session_date
  )
  where duplicate_of_id is null;

create or replace function public.guard_substitution_request_duplicate_marker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' and new.duplicate_of_id is not null then
    raise exception using
      errcode = '23514',
      message = 'Không được tự tạo bản đánh dấu trùng cho yêu cầu dạy thay.',
      detail = 'SUBSTITUTION_DUPLICATE_MARKER_PROTECTED';
  end if;

  if tg_op = 'UPDATE'
     and new.duplicate_of_id is distinct from old.duplicate_of_id
  then
    raise exception using
      errcode = '23514',
      message = 'Không được thay đổi liên kết bản trùng của yêu cầu dạy thay.',
      detail = 'SUBSTITUTION_DUPLICATE_MARKER_PROTECTED';
  end if;

  if tg_op = 'UPDATE'
     and old.duplicate_of_id is not null
     and (
       new.status is distinct from old.status
       or new.class_id is distinct from old.class_id
       or new.session_date is distinct from old.session_date
       or new.standing_teacher_id is distinct from old.standing_teacher_id
       or new.substitute_teacher_id is distinct from old.substitute_teacher_id
     )
  then
    raise exception using
      errcode = '23514',
      message = 'Bản yêu cầu trùng đã được lưu lịch sử và không thể chỉnh sửa.',
      detail = 'SUBSTITUTION_ARCHIVED_DUPLICATE';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_substitution_request_duplicate_marker()
from public;

drop trigger if exists guard_substitution_request_duplicate_marker
on public.teacher_substitution_requests;
create trigger guard_substitution_request_duplicate_marker
before insert or update of duplicate_of_id, status, class_id, session_date,
  standing_teacher_id, substitute_teacher_id
on public.teacher_substitution_requests
for each row
execute function public.guard_substitution_request_duplicate_marker();

comment on column public.teacher_substitution_requests.duplicate_of_id is
  'Historical duplicate linked to its canonical request. New requests must leave this NULL.';

commit;
