-- STUDENT AVATARS
-- Private bucket + narrowly scoped Storage policies
-- Object format:
-- student-avatars/<student-id>/avatar.webp

begin;

-- =========================================================
-- 1. PRIVATE BUCKET
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'student-avatars',
  'student-avatars',
  false,
  102400, -- 100 KB
  array['image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 102400,
  allowed_mime_types = array['image/webp'];


-- =========================================================
-- 2. REMOVE ONLY OUR AVATAR POLICIES IF THEY ALREADY EXIST
-- =========================================================

drop policy if exists "student avatar authorized read"
on storage.objects;

drop policy if exists "student avatar authorized insert"
on storage.objects;

drop policy if exists "student avatar authorized update"
on storage.objects;


-- =========================================================
-- 3. READ
-- Admin / Manager:
--   may read avatar only when folder is a real student ID.
--
-- Teacher:
--   may read only students actively belonging to a class
--   that teacher is actually assigned to.
-- =========================================================

create policy "student avatar authorized read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-avatars'

  -- Exact filename only
  and storage.filename(name) = 'avatar.webp'

  -- Exactly one folder:
  -- <student-id>/avatar.webp
  and array_length(storage.foldername(name), 1) = 1

  -- Folder must represent a real student
  and exists (
    select 1
    from public.students s
    where s.id::text = (storage.foldername(name))[1]
  )

  and (
    -- ADMIN / MANAGER
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role in ('admin', 'manager')
    )

    or

    -- TEACHER: only students in classes assigned to teacher
    exists (
      select 1
      from public.teachers t
      join public.profiles p
        on p.id = t.profile_id
      join public.class_teachers ct
        on ct.teacher_id = t.id
      join public.class_students cs
        on cs.class_id = ct.class_id
      join public.students s
        on s.id = cs.student_id
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


-- =========================================================
-- 4. INSERT
-- Required the first time a student gets an avatar.
-- =========================================================

create policy "student avatar authorized insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'student-avatars'

  and storage.filename(name) = 'avatar.webp'

  and array_length(storage.foldername(name), 1) = 1

  and exists (
    select 1
    from public.students s
    where s.id::text = (storage.foldername(name))[1]
  )

  and (
    -- ADMIN / MANAGER
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role in ('admin', 'manager')
    )

    or

    -- TEACHER
    exists (
      select 1
      from public.teachers t
      join public.profiles p
        on p.id = t.profile_id
      join public.class_teachers ct
        on ct.teacher_id = t.id
      join public.class_students cs
        on cs.class_id = ct.class_id
      join public.students s
        on s.id = cs.student_id
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


-- =========================================================
-- 5. UPDATE
-- Required when replacing existing avatar.webp.
-- Both USING and WITH CHECK are intentionally enforced.
-- =========================================================

create policy "student avatar authorized update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'student-avatars'

  and storage.filename(name) = 'avatar.webp'

  and array_length(storage.foldername(name), 1) = 1

  and exists (
    select 1
    from public.students s
    where s.id::text = (storage.foldername(name))[1]
  )

  and (
    -- ADMIN / MANAGER
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role in ('admin', 'manager')
    )

    or

    -- TEACHER
    exists (
      select 1
      from public.teachers t
      join public.profiles p
        on p.id = t.profile_id
      join public.class_teachers ct
        on ct.teacher_id = t.id
      join public.class_students cs
        on cs.class_id = ct.class_id
      join public.students s
        on s.id = cs.student_id
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

  and storage.filename(name) = 'avatar.webp'

  and array_length(storage.foldername(name), 1) = 1

  and exists (
    select 1
    from public.students s
    where s.id::text = (storage.foldername(name))[1]
  )

  and (
    -- ADMIN / MANAGER
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role in ('admin', 'manager')
    )

    or

    -- TEACHER
    exists (
      select 1
      from public.teachers t
      join public.profiles p
        on p.id = t.profile_id
      join public.class_teachers ct
        on ct.teacher_id = t.id
      join public.class_students cs
        on cs.class_id = ct.class_id
      join public.students s
        on s.id = cs.student_id
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