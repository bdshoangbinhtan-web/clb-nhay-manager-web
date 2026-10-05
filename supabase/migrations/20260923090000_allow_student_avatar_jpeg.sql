-- Add the normalized JPEG avatar object without invalidating legacy WebP avatars.
-- New object format: student-avatars/<student-id>/avatar.jpg

begin;

update storage.buckets
set
  file_size_limit = 2097152, -- 2 MiB; the client normally produces a much smaller 800px JPEG
  allowed_mime_types = array['image/jpeg', 'image/webp']
where id = 'student-avatars';

drop policy if exists "student avatar jpeg authorized read"
on storage.objects;

drop policy if exists "student avatar jpeg authorized insert"
on storage.objects;

drop policy if exists "student avatar jpeg authorized update"
on storage.objects;

create policy "student avatar jpeg authorized read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-avatars'
  and storage.filename(name) = 'avatar.jpg'
  and array_length(storage.foldername(name), 1) = 1
  and exists (
    select 1
    from public.students s
    where s.id::text = (storage.foldername(name))[1]
  )
  and (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role in ('admin', 'manager')
    )
    or exists (
      select 1
      from public.teachers t
      join public.profiles p on p.id = t.profile_id
      join public.class_teachers ct on ct.teacher_id = t.id
      join public.class_students cs on cs.class_id = ct.class_id
      join public.students s on s.id = cs.student_id
      where p.id = auth.uid()
        and p.is_active = true
        and p.role = 'teacher'
        and t.status = 'active'
        and cs.status = 'active'
        and s.status = 'active'
        and s.id::text = (storage.foldername(name))[1]
    )
  )
);

create policy "student avatar jpeg authorized insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'student-avatars'
  and storage.filename(name) = 'avatar.jpg'
  and array_length(storage.foldername(name), 1) = 1
  and exists (
    select 1
    from public.students s
    where s.id::text = (storage.foldername(name))[1]
  )
  and (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role in ('admin', 'manager')
    )
    or exists (
      select 1
      from public.teachers t
      join public.profiles p on p.id = t.profile_id
      join public.class_teachers ct on ct.teacher_id = t.id
      join public.class_students cs on cs.class_id = ct.class_id
      join public.students s on s.id = cs.student_id
      where p.id = auth.uid()
        and p.is_active = true
        and p.role = 'teacher'
        and t.status = 'active'
        and cs.status = 'active'
        and s.status = 'active'
        and s.id::text = (storage.foldername(name))[1]
    )
  )
);

create policy "student avatar jpeg authorized update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'student-avatars'
  and storage.filename(name) = 'avatar.jpg'
  and array_length(storage.foldername(name), 1) = 1
  and exists (
    select 1
    from public.students s
    where s.id::text = (storage.foldername(name))[1]
  )
  and (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role in ('admin', 'manager')
    )
    or exists (
      select 1
      from public.teachers t
      join public.profiles p on p.id = t.profile_id
      join public.class_teachers ct on ct.teacher_id = t.id
      join public.class_students cs on cs.class_id = ct.class_id
      join public.students s on s.id = cs.student_id
      where p.id = auth.uid()
        and p.is_active = true
        and p.role = 'teacher'
        and t.status = 'active'
        and cs.status = 'active'
        and s.status = 'active'
        and s.id::text = (storage.foldername(name))[1]
    )
  )
)
with check (
  bucket_id = 'student-avatars'
  and storage.filename(name) = 'avatar.jpg'
  and array_length(storage.foldername(name), 1) = 1
  and exists (
    select 1
    from public.students s
    where s.id::text = (storage.foldername(name))[1]
  )
  and (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role in ('admin', 'manager')
    )
    or exists (
      select 1
      from public.teachers t
      join public.profiles p on p.id = t.profile_id
      join public.class_teachers ct on ct.teacher_id = t.id
      join public.class_students cs on cs.class_id = ct.class_id
      join public.students s on s.id = cs.student_id
      where p.id = auth.uid()
        and p.is_active = true
        and p.role = 'teacher'
        and t.status = 'active'
        and cs.status = 'active'
        and s.status = 'active'
        and s.id::text = (storage.foldername(name))[1]
    )
  )
);

commit;
