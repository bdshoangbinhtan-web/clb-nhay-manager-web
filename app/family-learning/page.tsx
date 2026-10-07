"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "admin" | "manager" | "teacher" | "receptionist" | "";

type DanceClass = {
  id: string;
  name: string;
  schedule: string | null;
};

type Student = {
  id: string;
  student_code: string;
  full_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  status: string | null;
};

const FAMILY_FUNCTION_URL =
  "https://efkkqhdyskhywtyydmyr.supabase.co/functions/v1/manager-family-bridge";

const FAMILY_PUBLISHABLE_KEY =
  "sb_publishable_lLNebXGjWpgdvbxZskpLfg_JcW4I9sY";

function formatPhone(phone: string | null) {
  if (!phone) return "Chưa có SĐT phụ huynh";
  return phone;
}

function safeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "bai-hoc"}${ext}`;
}

export default function FamilyLearningPage() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<Role>("");
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<{
    studentId: string;
    studentName: string;
    phone: string;
    pin: string | null;
    existingCode: boolean;
  } | null>(null);

  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonSubtitle, setLessonSubtitle] = useState("");
  const [lessonLink, setLessonLink] = useState("");
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");

  async function callBridge(payload: Record<string, unknown>) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }

    const response = await fetch(FAMILY_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: FAMILY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.ok === false || result?.error) {
      const code = String(result?.error ?? "Không kết nối được Family.");
      const friendly: Record<string, string> = {
        student_parent_phone_missing:
          "Học viên chưa có số điện thoại phụ huynh.",
        forbidden: "Tài khoản này không có quyền thực hiện thao tác.",
        class_not_found: "Không tìm thấy lớp.",
        media_url_required: "Vui lòng chọn file hoặc dán liên kết bài học.",
        parent_pin_failed: "Chưa tạo được mã vào app.",
      };
      throw new Error(friendly[code] ?? code);
    }

    return result;
  }

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (active) {
          setMessage("Phiên đăng nhập đã hết hạn.");
          setLoading(false);
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.is_active) {
        if (active) {
          setMessage("Tài khoản đang bị khóa.");
          setLoading(false);
        }
        return;
      }

      const nextRole = (profile.role ?? "") as Role;
      if (active) setRole(nextRole);

      let classRows: DanceClass[] = [];

      if (nextRole === "teacher") {
        const { data: teacher } = await supabase
          .from("teachers")
          .select("id")
          .eq("profile_id", user.id)
          .eq("status", "active")
          .maybeSingle();

        if (teacher?.id) {
          const { data: assignments } = await supabase
            .from("class_teachers")
            .select("class_id")
            .eq("teacher_id", teacher.id);

          const ids = (assignments ?? []).map((row) => row.class_id);

          if (ids.length) {
            const { data } = await supabase
              .from("classes")
              .select("id,name,schedule")
              .in("id", ids)
              .eq("status", "active")
              .order("name");
            classRows = data ?? [];
          }
        }
      } else if (nextRole === "admin" || nextRole === "manager") {
        const { data } = await supabase
          .from("classes")
          .select("id,name,schedule")
          .eq("status", "active")
          .order("name");
        classRows = data ?? [];
      }

      let studentRows: Student[] = [];

      if (nextRole === "admin" || nextRole === "manager") {
        const { data } = await supabase
          .from("students")
          .select(
            "id,student_code,full_name,parent_name,parent_phone,status"
          )
          .order("full_name");
        studentRows = data ?? [];
      }

      if (!active) return;

      setClasses(classRows);
      setStudents(studentRows);
      if (classRows[0]) setSelectedClass(classRows[0].id);
      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [supabase]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students.slice(0, 20);

    return students
      .filter((student) =>
        [
          student.full_name,
          student.student_code,
          student.parent_name ?? "",
          student.parent_phone ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 30);
  }, [studentSearch, students]);

  async function provisionParent(student: Student, resetPin: boolean) {
    if (!student.parent_phone) {
      alert("Học viên chưa có số điện thoại phụ huynh.");
      return;
    }

    setBusyStudentId(student.id);
    setIssuedCode(null);
    setMessage("");

    try {
      const result = await callBridge({
        action: "provision_parent",
        student_id: student.id,
        reset_pin: resetPin,
      });

      setIssuedCode({
        studentId: student.id,
        studentName: student.full_name,
        phone: result.phone,
        pin: result.pin ?? null,
        existingCode: Boolean(result.existing_code),
      });

      setMessage(
        result.pin
          ? `Đã cấp mã cho ${student.full_name}.`
          : `Đã nối ${student.full_name} vào Family. Phụ huynh đang có mã dùng chung.`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không cấp được mã.");
    } finally {
      setBusyStudentId(null);
    }
  }

  async function revokeParent(student: Student) {
    if (!confirm(
      `Thu hồi quyền vào app của SĐT ${student.parent_phone ?? ""}? Nếu cùng SĐT có nhiều bé, quyền của cả gia đình sẽ bị thu hồi.`
    )) {
      return;
    }

    setBusyStudentId(student.id);
    setMessage("");

    try {
      await callBridge({
        action: "revoke_parent",
        student_id: student.id,
      });
      setIssuedCode(null);
      setMessage(`Đã thu hồi quyền vào app của phụ huynh ${student.full_name}.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thu hồi được quyền.");
    } finally {
      setBusyStudentId(null);
    }
  }

  async function publishLesson() {
    if (!selectedClass) {
      alert("Vui lòng chọn lớp.");
      return;
    }

    if (!lessonTitle.trim()) {
      alert("Vui lòng nhập tên bài học.");
      return;
    }

    if (!lessonFile && !lessonLink.trim()) {
      alert("Vui lòng chọn nhạc/clip hoặc dán liên kết.");
      return;
    }

    setPublishing(true);
    setMessage("");

    try {
      let mediaUrl = lessonLink.trim();
      let kind: "audio" | "video" = "video";

      if (lessonFile) {
        if (
          !lessonFile.type.startsWith("audio/") &&
          !lessonFile.type.startsWith("video/")
        ) {
          throw new Error("Chỉ nhận file nhạc hoặc video.");
        }

        kind = lessonFile.type.startsWith("audio/") ? "audio" : "video";

        const path = `${selectedClass}/${crypto.randomUUID()}-${safeFileName(
          lessonFile.name
        )}`;

        const { error: uploadError } = await supabase.storage
          .from("family-learning")
          .upload(path, lessonFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: lessonFile.type || undefined,
          });

        if (uploadError) {
          throw new Error("Không tải file lên được: " + uploadError.message);
        }

        const { data } = supabase.storage
          .from("family-learning")
          .getPublicUrl(path);

        mediaUrl = data.publicUrl;
      } else {
        const lower = mediaUrl.toLowerCase();
        kind =
          lower.includes(".mp3") ||
          lower.includes(".m4a") ||
          lower.includes(".wav")
            ? "audio"
            : "video";
      }

      const result = await callBridge({
        action: "publish_learning",
        class_id: selectedClass,
        kind,
        title: lessonTitle.trim(),
        subtitle: lessonSubtitle.trim() || null,
        media_url: mediaUrl,
      });

      setLessonTitle("");
      setLessonSubtitle("");
      setLessonLink("");
      setLessonFile(null);
      const fileInput = document.getElementById(
        "abk-learning-file"
      ) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      setMessage(
        `Đã đăng “${lessonTitle.trim()}” cho lớp ${result.class_name}. App phụ huynh và máy bé sẽ thấy bài mới.`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không đăng được bài học.");
    } finally {
      setPublishing(false);
    }
  }

  const canManageCodes = role === "admin" || role === "manager";
  const canPublish =
    role === "admin" || role === "manager" || role === "teacher";

  if (loading) {
    return (
      <div className="ui-card p-6 text-sm font-bold text-slate-500">
        Đang tải Học cùng ABK…
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-7">
      <section className="ui-card p-5 sm:p-6">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
          CLB ANGEL BK
        </div>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
          🎵 Học cùng ABK
        </h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
          Giáo viên gửi nhạc hoặc clip của lớp. Admin có thể cấp mã 6 số để
          phụ huynh đăng nhập app bằng số điện thoại.
        </p>
        {message ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
            {message}
          </div>
        ) : null}
      </section>

      {canPublish ? (
        <section className="ui-card p-5 sm:p-6">
          <h2 className="text-xl font-black">📚 Đăng bài cho lớp</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Giáo viên chỉ đăng được cho lớp mình phụ trách. Admin/Manager thấy tất cả lớp.
          </p>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Lớp
              <select
                className="ui-input"
                value={selectedClass}
                onChange={(event) => setSelectedClass(event.target.value)}
              >
                {classes.length === 0 ? (
                  <option value="">Chưa có lớp phù hợp</option>
                ) : null}
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.schedule ? ` · ${item.schedule}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-black text-slate-700">
              Tên bài học
              <input
                className="ui-input"
                value={lessonTitle}
                onChange={(event) => setLessonTitle(event.target.value)}
                placeholder="Ví dụ: Bài Trăng ơi ời ơi - đoạn 1"
                maxLength={160}
              />
            </label>

            <label className="grid gap-2 text-sm font-black text-slate-700">
              Ghi chú cho phụ huynh
              <input
                className="ui-input"
                value={lessonSubtitle}
                onChange={(event) => setLessonSubtitle(event.target.value)}
                placeholder="Ví dụ: Cho bé ôn từ đầu đến 0:45"
                maxLength={300}
              />
            </label>

            <div className="rounded-[22px] bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-sm font-black text-slate-700">
                Chọn nhạc hoặc clip
              </div>
              <input
                id="abk-learning-file"
                type="file"
                accept="audio/*,video/*"
                onChange={(event) =>
                  setLessonFile(event.target.files?.[0] ?? null)
                }
                className="mt-3 block w-full text-sm font-semibold text-slate-600"
              />
              {lessonFile ? (
                <div className="mt-2 text-xs font-bold text-emerald-700">
                  ✓ {lessonFile.name}
                </div>
              ) : null}
              <div className="my-4 flex items-center gap-3 text-xs font-black text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                HOẶC
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <input
                className="ui-input"
                value={lessonLink}
                onChange={(event) => setLessonLink(event.target.value)}
                placeholder="Dán link video/nhạc nếu không tải file lên"
              />
              <div className="mt-2 text-xs font-semibold text-slate-400">
                File tối đa 250MB. Nên dùng MP3, M4A hoặc MP4.
              </div>
            </div>

            <button
              type="button"
              onClick={() => void publishLesson()}
              disabled={publishing || !selectedClass}
              className="ui-btn ui-btn-primary min-h-14 w-full text-base disabled:opacity-50"
            >
              {publishing ? "ĐANG ĐĂNG…" : "ĐĂNG CHO PHỤ HUYNH & BÉ"}
            </button>
          </div>
        </section>
      ) : null}

      {canManageCodes ? (
        <section className="ui-card p-5 sm:p-6">
          <h2 className="text-xl font-black">🔐 Mã vào app phụ huynh</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Phụ huynh đăng nhập bằng SĐT đang lưu trong hồ sơ học viên + mã 6 số.
          </p>

          {issuedCode ? (
            <div className="mt-5 rounded-[24px] bg-blue-50 p-5 ring-1 ring-blue-200">
              <div className="text-sm font-black text-blue-800">
                {issuedCode.studentName} · {issuedCode.phone}
              </div>
              {issuedCode.pin ? (
                <>
                  <div className="mt-3 text-center text-4xl font-black tracking-[0.28em] text-slate-950">
                    {issuedCode.pin}
                  </div>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(issuedCode.pin ?? "")}
                    className="ui-btn mt-4 min-h-12 w-full"
                  >
                    SAO CHÉP MÃ
                  </button>
                  <div className="mt-2 text-center text-xs font-bold text-slate-500">
                    Mã chỉ hiện lúc vừa cấp/đặt lại. Hệ thống không lưu mã rõ.
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm font-bold text-slate-700">
                  Phụ huynh này đã có mã dùng chung. Nếu quên mã, bấm
                  <span className="font-black"> Đặt lại mã </span>
                  ở học viên bên dưới.
                </div>
              )}
            </div>
          ) : null}

          <label className="mt-5 block">
            <span className="sr-only">Tìm học viên</span>
            <input
              className="ui-input"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="Tìm tên, mã HV hoặc SĐT phụ huynh…"
            />
          </label>

          <div className="mt-4 grid gap-3">
            {filteredStudents.map((student) => (
              <div
                key={student.id}
                className="rounded-[22px] bg-white p-4 ring-1 ring-slate-200"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900">
                      {student.full_name}
                    </div>
                    <div className="mt-1 text-xs font-bold text-slate-500">
                      {student.student_code} · {formatPhone(student.parent_phone)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <button
                      type="button"
                      disabled={busyStudentId === student.id || !student.parent_phone}
                      onClick={() => void provisionParent(student, false)}
                      className="ui-btn ui-btn-primary min-h-11 px-3 text-xs disabled:opacity-40"
                    >
                      CẤP / NỐI APP
                    </button>
                    <button
                      type="button"
                      disabled={busyStudentId === student.id || !student.parent_phone}
                      onClick={() => void provisionParent(student, true)}
                      className="ui-btn min-h-11 px-3 text-xs disabled:opacity-40"
                    >
                      ĐẶT LẠI MÃ
                    </button>
                    <button
                      type="button"
                      disabled={busyStudentId === student.id || !student.parent_phone}
                      onClick={() => void revokeParent(student)}
                      className="ui-btn min-h-11 px-3 text-xs text-red-700 disabled:opacity-40 sm:col-span-2"
                    >
                      THU HỒI
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredStudents.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                Không tìm thấy học viên phù hợp.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
