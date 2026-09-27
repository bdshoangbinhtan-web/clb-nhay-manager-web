import type { SupabaseClient } from "@supabase/supabase-js";
import { StudentAvatarError, avatarErrorDetails } from "./student-avatar-image.ts";

export const STUDENT_AVATAR_BUCKET = "student-avatars";
export const AVATAR_URL_TTL_SECONDS = 60 * 60;
export const STUDENT_AVATAR_FILENAME = "avatar.jpg";
export const LEGACY_STUDENT_AVATAR_FILENAME = "avatar.webp";

export function studentAvatarPath(studentId: string) {
  if (!studentId || studentId.includes("/") || studentId.includes("..")) {
    throw new Error("Mã học viên không hợp lệ.");
  }
  return `${studentId}/${STUDENT_AVATAR_FILENAME}`;
}

function legacyStudentAvatarPath(studentId: string) {
  if (!studentId || studentId.includes("/") || studentId.includes("..")) {
    throw new Error("Mã học viên không hợp lệ.");
  }
  return `${studentId}/${LEGACY_STUDENT_AVATAR_FILENAME}`;
}

function versionedSignedUrl(signedUrl: string) {
  return `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

export async function getStudentAvatarUrl(
  supabase: SupabaseClient,
  studentId: string,
) {
  const { data, error } = await supabase.storage
    .from(STUDENT_AVATAR_BUCKET)
    .createSignedUrls(
      [studentAvatarPath(studentId), legacyStudentAvatarPath(studentId)],
      AVATAR_URL_TTL_SECONDS,
    );
  if (error) return null;
  const match = data.find((item) => item.signedUrl && !item.error);
  return match?.signedUrl ? versionedSignedUrl(match.signedUrl) : null;
}

export async function getStudentAvatarUrls(
  supabase: SupabaseClient,
  studentIds: string[],
) {
  const uniqueIds = [...new Set(studentIds)];
  if (!uniqueIds.length) return new Map<string, string>();
  // Prefer the normalized JPEG while continuing to display existing WebP
  // objects. This keeps already-working Android avatars visible.
  const paths = [
    ...uniqueIds.map(studentAvatarPath),
    ...uniqueIds.map(legacyStudentAvatarPath),
  ];
  const { data, error } = await supabase.storage
    .from(STUDENT_AVATAR_BUCKET)
    .createSignedUrls(paths, AVATAR_URL_TTL_SECONDS);
  if (error) return new Map<string, string>();

  const result = new Map<string, string>();
  uniqueIds.forEach((studentId, index) => {
    const current = data[index];
    const legacy = data[index + uniqueIds.length];
    const match = current?.signedUrl && !current.error ? current : legacy;
    if (match?.signedUrl && !match.error) result.set(studentId, match.signedUrl);
  });
  return result;
}

export async function uploadStudentAvatar(
  supabase: SupabaseClient,
  studentId: string,
  processedAvatar: Blob,
) {
  // A camera File is deliberately rejected: callers may upload only the locally
  // rendered JPEG Blob produced by processStudentAvatar().
  if (
    (typeof File !== "undefined" && processedAvatar instanceof File)
    || processedAvatar.type !== "image/jpeg"
  ) {
    throw new StudentAvatarError(
      "storage-upload",
      "Chỉ ảnh JPEG đã cắt và tối ưu mới được tải lên.",
    );
  }

  console.info("[student-avatar] storage upload started", {
    fileName: STUDENT_AVATAR_FILENAME,
    contentType: processedAvatar.type,
    fileSize: processedAvatar.size,
  });

  const { error } = await supabase.storage
    .from(STUDENT_AVATAR_BUCKET)
    .upload(studentAvatarPath(studentId), processedAvatar, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });
  if (error) {
    const uploadError = new StudentAvatarError(
      "storage-upload",
      "Supabase Storage không lưu được ảnh đại diện.",
      { cause: error },
    );
    console.error("[student-avatar] storage upload failed", {
      ...avatarErrorDetails(uploadError),
      storageError: avatarErrorDetails(error),
    });
    throw uploadError;
  }

  const freshUrl = await getStudentAvatarUrl(supabase, studentId);
  if (!freshUrl) {
    const refreshError = new StudentAvatarError(
      "avatar-url-refresh",
      "Đã tải ảnh lên nhưng không tạo được liên kết ảnh mới.",
    );
    console.error("[student-avatar] avatar URL refresh failed", avatarErrorDetails(refreshError));
    throw refreshError;
  }

  console.info("[student-avatar] storage upload succeeded", {
    fileName: STUDENT_AVATAR_FILENAME,
    contentType: processedAvatar.type,
    fileSize: processedAvatar.size,
  });
  return freshUrl;
}
