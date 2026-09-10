/**
 * Public media convention: place files at the paths below. Components fall back
 * gracefully until a file exists, so no code change is required when assets arrive.
 */
export const publicMedia = {
  hero: "/ANGEL-BK-WEBSITE/hoc-vien/hero.jpg",
  classSession: "/ANGEL-BK-WEBSITE/video/mot-buoi-hoc.jpg",
  gallery: {
    students: "/ANGEL-BK-WEBSITE/hoc-vien/khoanh-khac-hoc-vien.jpg",
    class: "/ANGEL-BK-WEBSITE/lop-hoc/khoanh-khac-lop-hoc.jpg",
    videoPoster: "/ANGEL-BK-WEBSITE/video/khoanh-khac-video.jpg",
  },
};

export function classImagePath(classId: string) {
  return `/ANGEL-BK-WEBSITE/lop-hoc/${classId}.jpg`;
}

export function teacherImagePath(teacherId: string) {
  return `/ANGEL-BK-WEBSITE/giao-vien/${teacherId}.jpg`;
}
