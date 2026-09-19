import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AVATAR_SIZE, AVATAR_WEBP_QUALITY, sourceCropRect } from "../lib/student-avatar-image.ts";
import { STUDENT_AVATAR_BUCKET, studentAvatarPath } from "../lib/student-avatar-storage.ts";

test("avatar contract uses one deterministic private WebP object", () => {
  assert.equal(STUDENT_AVATAR_BUCKET, "student-avatars");
  assert.equal(studentAvatarPath("abc-student-id"), "abc-student-id/avatar.webp");
  assert.throws(() => studentAvatarPath("abc/other"));
});

test("image contract is 320 square WebP at the intended quality", () => {
  assert.equal(AVATAR_SIZE, 320);
  assert.equal(AVATAR_WEBP_QUALITY, 0.78);
  const source = readFileSync("lib/student-avatar-image.ts", "utf8");
  assert.match(source, /canvasToBlob\(output, "image\/webp", AVATAR_WEBP_QUALITY\)/);
});

test("manual crop remains valid without face detection", () => {
  assert.deepEqual(sourceCropRect(1200, 800, { centerX: 600, centerY: 400, zoom: 1 }), { x: 200, y: 0, size: 800 });
});

test("multiple faces are not auto-selected", () => {
  const editor = readFileSync("components/students/student-avatar-editor.tsx", "utf8");
  assert.match(editor, /faces\.length === 1/);
  assert.match(editor, /faces\.length > 1/);
  assert.doesNotMatch(editor, /largest/i);
});

test("original File cannot be uploaded and upload is only after Dùng ảnh", () => {
  const storage = readFileSync("lib/student-avatar-storage.ts", "utf8");
  assert.match(storage, /processedAvatar instanceof File/);
  assert.match(storage, /contentType: "image\/webp"/);
  const detail = readFileSync("app/students/[id]/page.tsx", "utf8");
  assert.match(detail, /uploadStudentAvatar\(supabase, id, blob\)/);
});

test("avatar editing is independent of profile edit mode and failures retain editor", () => {
  const detail = readFileSync("app/students/[id]/page.tsx", "utf8");
  assert.match(detail, /editable=\{canEditAvatar\}/);
  const editor = readFileSync("components/students/student-avatar-editor.tsx", "utf8");
  assert.match(editor, /Chưa lưu được ảnh\. Ảnh cũ vẫn được giữ\./);
  assert.match(editor, /setStage\("failed"\)/);
});

test("missing avatar has a placeholder and camera activation is direct", () => {
  const avatar = readFileSync("components/students/student-avatar.tsx", "utf8");
  assert.match(avatar, /Chưa có ảnh đại diện/);
  assert.match(avatar, /capture="environment"/);
  assert.match(avatar, /cameraRef\.current\?\.click\(\)/);
});
