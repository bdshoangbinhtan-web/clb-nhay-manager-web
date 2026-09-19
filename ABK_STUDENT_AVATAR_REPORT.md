# ABK Student Avatar Capture — Implementation Report

## Baseline and scope

- Verified before editing that `HEAD` was `4e71883a52f85baa8af5cc5610f39e127709f6ee` (`finalize students mobile experience`) and that the current branch was `work`.
- The implementation is limited to student avatar capture, local editing, private Storage access, and avatar display. Student, tuition, class, attendance, payroll, and navigation business logic was not redesigned.
- No deployment, merge, push, or Supabase migration application was performed.

## Architecture and files

- `components/students/student-avatar.tsx`: reusable fixed-size display, resilient placeholder, lazy/async image, direct camera input, camera affordance, and secondary gallery input.
- `components/students/student-avatar-editor.tsx`: mobile editor with pan, slider/pinch zoom, retake, cancel, local face-centering attempt, processing/saving states, and retry-preserving failure state.
- `lib/student-avatar-image.ts`: MIME validation, browser decode/orientation normalization, maximum 1920px working representation, crop math, and 320×320 WebP output at initial quality `0.78`.
- `lib/student-avatar-storage.ts`: deterministic paths, single/batch signed URLs, final-Blob-only validation, and upsert.
- Student Detail owns capture/editor state independently of `edit=1`; Student list only displays avatars.
- `supabase/migrations/20260919090000_create_private_student_avatars.sql`: manual-review Storage setup only.
- `tests/student-avatar.test.ts`: focused architecture and behavior contracts.

## Storage design and authorization

- Bucket: `student-avatars`, explicitly private (`public = false`), WebP-only, with a 100 KiB upper bound.
- Exactly one object per student: `<student-id>/avatar.webp`; overwrite uses `upsert`. There is no original, thumbnail, random name, database avatar column, public URL, or persisted signed URL.
- Viewing uses short-lived authenticated signed URLs. Overwrites request a fresh URL with a cache-busting version.
- Active admins and managers can read/write according to their existing profile role authority.
- A teacher can read/write only when the active teacher record linked through `teachers.profile_id` has a `class_teachers` assignment to a class with an active `class_students` membership for the object-path student. The existing authoritative chain is therefore sufficient, and secure teacher policy was achievable. The policy checks this server-side for both insert and update; no broad authenticated-user policy was created.
- The setup file changes only the Storage bucket configuration and Storage object policies. **It was prepared but not applied.** It must be reviewed against grants/RLS in the target Supabase project before manual application.

## Private image pipeline

1. A user taps the Detail avatar, directly invoking a user-gesture-bound `capture="environment"` file input. Permission is not requested at page load.
2. The browser validates JPEG/PNG/WebP and decodes with image orientation handling. Unsupported/undecodable formats receive the required Vietnamese guidance.
3. A single working canvas is capped at 1920px maximum dimension; the decoded bitmap is promptly closed. Temporary preview object URLs and canvases are cleaned up.
4. Crop/pan/zoom remains local. No upload occurs on camera selection, editor open, cancel, or retake.
5. Only after **Dùng ảnh**, the crop is rendered to exactly 320×320 and encoded as `image/webp` at quality `0.78`. Expected practical output is about 20–50 KB, with normal photographic variation; quality is not repeatedly destroyed to meet an exact byte target.
6. The Storage helper rejects a `File` and accepts only a processed WebP `Blob`; the original photo is never sent to Supabase.

## Face detection and fallback

- Native browser `FaceDetector` is used only after the editor opens, when available. Processing is local and temporary: no recognition, identity comparison, embedding, saved coordinates, biometric template, model download, or external service.
- Exactly one detected face seeds a natural face/headroom crop. Zero faces keeps centered manual crop and explains how to adjust it. Multiple faces never select the largest or guess a child; the user is prompted to choose by dragging.
- Browsers without `FaceDetector` use the same fully functional manual pan/zoom editor. No face-detection dependency was added, so normal Student bundles do not include a model.

## List performance

- Student data resolves and cards render first with stable placeholders. A later effect requests signed URLs only for the current incremental visible batch.
- `createSignedUrls` performs one batch Storage request rather than sequential per-card requests. The client stores a `studentId → signed URL` map. There are no avatar database queries and no N+1 database query pattern.
- Images have fixed dimensions, `loading="lazy"`, and `decoding="async"`. Signed 320px objects intentionally use native images rather than per-request Next optimization.

## Validation and limitations

- Focused tests cover deterministic path, target dimensions/format/quality contract, processed-Blob-only upload, manual no-face crop, no multiple-face selection, independent Detail interaction, failure preservation, placeholder, and direct camera capture markup.
- Static TypeScript, ESLint, diff validation, focused tests, and the existing suite were run; exact results are recorded in the completion response.
- The migration was not applied, so live Storage/RLS behavior requires validation after manual review/application in the real Supabase project.
- This cloud environment cannot validate a physical camera, Samsung picker behavior, native `FaceDetector` availability, touch feel, real network interruption, or actual photographic output sizes. Those remain real-device checks.

## Samsung / Android manual test checklist

1. Open Student Detail.
2. Tap avatar.
3. Confirm camera opens directly.
4. Take photo.
5. Confirm crop screen opens.
6. Confirm auto face center if supported.
7. Drag image.
8. Zoom (slider and pinch where supported).
9. Tap **Dùng ảnh**.
10. Confirm avatar updates immediately.

Also test:

- cancel camera (old avatar remains and profile stays open)
- **Chụp lại**
- gallery selection
- image with no face
- image with two people
- network failure and **Thử lại**
- reopen Student Detail
- return to Student list
- avatar lazy loading
- long-list scroll performance
