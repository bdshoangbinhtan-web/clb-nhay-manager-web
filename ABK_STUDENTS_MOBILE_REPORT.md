# ABK Students Mobile Report

## Scope

This pass is limited to the manager **Học viên** list and student-detail experience. Attendance, Tuition, Dashboard, Teacher, database, authentication, native projects, and shared mobile-foundation behavior were not redesigned.

## Existing Students architecture found

- `/students` is a client-rendered list. It loads students, branches, and active `class_students` memberships in parallel from Supabase, then applies the existing name/code search, branch filter, and `active` / `inactive` status filter locally.
- `/students/[id]` loads the student, branches, classes, and active memberships. Existing actions edit the profile, add/remove a class, transfer a class through `transfer_student_class`, and perform the existing tuition adjustment workflow when an active student is suspended.
- `/students/new` retains the existing create flow: duplicate warning, class assignment, and hand-off to the existing Tuition page for active students.
- No new statuses, database fields, RPCs, financial operations, or attendance behavior were introduced.

## Files changed

- `app/students/page.tsx`
  - Mobile-safe list, search/filter controls, URL state, scroll restoration, skeleton/empty/error states, and responsive overflow protection.
- `app/students/[id]/page.tsx`
  - Mobile-safe detail hierarchy, larger actions, responsive identity/contact/class content, return-context handling, and stable Supabase client creation.
- `ABK_STUDENTS_MOBILE_REPORT.md`
  - Implementation and validation record.

## Mobile student list

- Student cards are fully tappable on small screens, with a prominent wrapping name, code, branch, current classes, and existing status.
- The mobile layout uses `min-width: 0`, `minmax(0, 1fr)`, `break-words`, `break-all`, and `overflow-wrap:anywhere` at the content boundaries that can receive long names, class names, codes, and branch labels.
- Important controls meet a roughly 44–48px touch target. Desktop keeps the multi-column cards and separate view/edit controls.
- Incremental batches remain at the existing 60-student size.

## Search and filters

- Search retains the existing local match semantics: case-insensitive student name or student code.
- Results update while typing, without a submit step. Search has a dedicated clear control and keeps the existing voice-search capability.
- Branch and status options come only from the existing data and statuses. The default remains `active`; status options remain `active`, `inactive`, and all.
- A single “Xóa bộ lọc” action restores the original defaults.

## Student detail

- The mobile order emphasizes identity, code, core profile information, edit action, status/branch/join date, then current class membership and its existing actions.
- Long names, contact strings, branch text, and class names wrap instead of clipping or widening the viewport.
- Edit, add-class, transfer, and remove-class behavior is unchanged. Destructive class removal retains its confirmation, and the existing suspension/tuition-adjustment confirmation flow is unchanged.
- Loading now uses skeleton blocks rather than a blank-feeling text card. Missing-student state retains a route back to the list context.

## Back and list-context preservation

- Search, branch, and status are mirrored into `/students` query parameters.
- Student links carry a validated `from` path. Detail and edit links keep that value, so the visible back action returns to the same list query.
- List scroll is saved in `sessionStorage` on navigation/page hide and restored after list data loads. No Supabase UI-state storage or global state library was added.

## Loading, empty, and error states

- The list uses the existing ABK skeleton, empty-state, and inline-error foundation components.
- It distinguishes a truly empty student collection from an empty filtered/search result.
- Supabase load errors expose a thumb-friendly retry action rather than leaving a blank screen.

## Desktop and foundation preservation

- Desktop remains a responsive multi-column student-card experience with its existing profile/edit entry points, filters, voice search, and student business actions.
- No shared foundation component, global CSS, navigation, branding, Attendance, Tuition calculation, Teacher/Admin module, schema, migration, RLS, auth, or native configuration was changed.

## Validation results

- `git diff --check`: passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: 58 tests passed; the one known pre-existing System Integrity UI assertion failed (`Xem dữ liệu kỹ thuật`). That module was intentionally not changed.
- `npm run build`: compilation and type validation passed; static generation then stopped at `/settings` because Supabase URL/API-key environment variables are unavailable. No fake environment values were added.
- Visual screenshot: not captured because this environment does not provide a browser automation/screenshot tool; responsive safety was reviewed programmatically at the 360–430px-oriented layout constraints.

## Intentionally unchanged

- Attendance and attendance history behavior.
- Tuition calculations, payment handling, and the existing suspension adjustment business logic.
- New-student business logic and Tuition hand-off.
- Dashboard, Teacher, other manager modules, navigation foundation, branding, and desktop shell behavior.
