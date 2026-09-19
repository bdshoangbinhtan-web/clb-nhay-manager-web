import type { SupabaseClient } from "@supabase/supabase-js";

export const STUDENT_AVATAR_BUCKET = "student-avatars";
export const AVATAR_URL_TTL_SECONDS = 60 * 60;

export function studentAvatarPath(studentId: string) {
  if (!studentId || studentId.includes("/") || studentId.includes("..")) {
    throw new Error("Mã học viên không hợp lệ.");
  }
  return `${studentId}/avatar.webp`;
}

export async function getStudentAvatarUrl(
  supabase: SupabaseClient,
  studentId: string,
) {
  const { data, error } = await supabase.storage
    .from(STUDENT_AVATAR_BUCKET)
    .createSignedUrl(studentAvatarPath(studentId), AVATAR_URL_TTL_SECONDS);
  return error ? null : `${data.signedUrl}${data.signedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

export async function getStudentAvatarUrls(
  supabase: SupabaseClient,
  studentIds: string[],
) {
  const uniqueIds = [...new Set(studentIds)];
  if (!uniqueIds.length) return new Map<string, string>();
  const paths = uniqueIds.map(studentAvatarPath);
  const { data, error } = await supabase.storage
    .from(STUDENT_AVATAR_BUCKET)
    .createSignedUrls(paths, AVATAR_URL_TTL_SECONDS);
  if (error) return new Map<string, string>();

  const result = new Map<string, string>();
  data.forEach((item, index) => {
    if (item.signedUrl && !item.error) result.set(uniqueIds[index], item.signedUrl);
  });
  return result;
}

export async function uploadStudentAvatar(
  supabase: SupabaseClient,
  studentId: string,
  processedAvatar: Blob,
) {
  // A camera File is deliberately rejected: callers may upload only the locally
  // rendered WebP Blob produced by processStudentAvatar().
  if (processedAvatar instanceof File || processedAvatar.type !== "image/webp") {
    throw new Error("Chỉ ảnh WebP đã tối ưu mới được tải lên.");
  }
  const { error } = await supabase.storage
    .from(STUDENT_AVATAR_BUCKET)
    .upload(studentAvatarPath(studentId), processedAvatar, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: true,
    });
  if (error) throw error;
  return getStudentAvatarUrl(supabase, studentId);
}
