 "use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vietnamCurrentMonth, vietnamToday } from "@/lib/vietnam-date";
import { StudentAvatar } from "@/components/students/student-avatar";
import { StudentAvatarEditor } from "@/components/students/student-avatar-editor";
import { getStudentAvatarUrl, uploadStudentAvatar } from "@/lib/student-avatar-storage";

type Student = {
  id: string;
  student_code: string;
  full_name: string;
  status: string | null;
  created_at: string;
  branch_id: string | null;
  parent_phone: string | null;
  birth_date: string | null;
  join_date: string | null;
};

type Branch = {
  id: string;
  name: string;
  address: string | null;
};

type DanceClass = {
  id: string;
  name: string;
  branch_id: string;
  monthly_fee: number;
  status: string;
};

type Tuition = {
  id: string;
  billing_month: string;
  amount_due: number;
  amount_paid: number;
  status: string;
};

type TuitionAdjustment = {
  id: string;
  tuition_id: string;
  action: "reserve" | "refund" | "carry_forward" | "cancel" | "none";
  amount: number;
};

type AdjustmentAction =
  | "reserve"
  | "refund"
  | "carry_forward"
  | "cancel"
  | "none";

function StudentDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const id = params.id;
  const editMode = searchParams.get("edit") === "1";
  const requestedReturnPath = searchParams.get("from");
  const returnPath = requestedReturnPath?.startsWith("/students")
    ? requestedReturnPath
    : "/students";
  const detailParams = new URLSearchParams({ from: returnPath });
  const detailPath = `/students/${id}?${detailParams.toString()}`;
  const editParams = new URLSearchParams({ edit: "1", from: returnPath });
  const editPath = `/students/${id}?${editParams.toString()}`;

  const [student, setStudent] = useState<Student | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allClasses, setAllClasses] = useState<DanceClass[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [transferFromClass, setTransferFromClass] = useState<string | null>(null);
  const [transferToClass, setTransferToClass] = useState("");
  const [transferring, setTransferring] = useState(false);

  const [name, setName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("active");
  const [suspendModal, setSuspendModal] = useState(false);
  const [tuitionLoading, setTuitionLoading] = useState(false);
  const [tuitionList, setTuitionList] = useState<Tuition[]>([]);
  const [currentTuition, setCurrentTuition] = useState<Tuition[]>([]);
  const [currentTuitionLoading, setCurrentTuitionLoading] = useState(true);
  const [adjustments, setAdjustments] = useState<TuitionAdjustment[]>([]);
  const [adjustmentAction, setAdjustmentAction] =
    useState<AdjustmentAction>("none");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentMonth, setAdjustmentMonth] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [processingAdjustment, setProcessingAdjustment] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [canEditAvatar, setCanEditAvatar] = useState(false);

  const loadAvatarAccess = useCallback(async () => {
    const [{ data: auth }, signedUrl] = await Promise.all([supabase.auth.getUser(), getStudentAvatarUrl(supabase, id)]);
    setAvatarUrl(signedUrl);
    if (!auth.user) { setCanEditAvatar(false); return; }
    const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", auth.user.id).maybeSingle();
    if (!profile?.is_active) { setCanEditAvatar(false); return; }
    if (profile.role === "admin" || profile.role === "manager") { setCanEditAvatar(true); return; }
    if (profile.role !== "teacher") { setCanEditAvatar(false); return; }
    const { data: teacher } = await supabase.from("teachers").select("id").eq("profile_id", auth.user.id).eq("status", "active").maybeSingle();
    if (!teacher) { setCanEditAvatar(false); return; }
    const [{ data: assignments }, { data: memberships }] = await Promise.all([
      supabase.from("class_teachers").select("class_id").eq("teacher_id", teacher.id),
      supabase.from("class_students").select("class_id").eq("student_id", id).eq("status", "active"),
    ]);
    const assigned = new Set((assignments ?? []).map((row) => row.class_id));
    setCanEditAvatar((memberships ?? []).some((row) => assigned.has(row.class_id)));
  }, [id, supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setCurrentTuitionLoading(true);

    const currentMonth = vietnamCurrentMonth();
    const [studentRes, branchesRes, classesRes, membershipRes, currentTuitionRes] =
      await Promise.all([
        supabase
          .from("students")
          .select("id,student_code,full_name,status,created_at,branch_id,parent_phone,birth_date,join_date")
          .eq("id", id)
          .single(),

        supabase
          .from("branches")
          .select("id,name,address")
          .order("name"),

        supabase
          .from("classes")
          .select("id,name,branch_id,monthly_fee,status")
          .order("name"),

        supabase
          .from("class_students")
          .select("class_id")
          .eq("student_id", id)
          .eq("status", "active"),

        supabase
          .from("tuition")
          .select("id,billing_month,amount_due,amount_paid,status")
          .eq("student_id", id)
          .eq("billing_month", `${currentMonth}-01`),
      ]);

    if (studentRes.error) {
      console.error(studentRes.error);
      setStudent(null);
      setCurrentTuitionLoading(false);
      setLoading(false);
      return;
    }

    setStudent(studentRes.data);
    setBranches(branchesRes.data ?? []);
    setAllClasses(classesRes.data ?? []);

    const memberIds = new Set(
      (membershipRes.data ?? []).map((row) => row.class_id)
    );

    setClasses(
      (classesRes.data ?? []).filter((item) => memberIds.has(item.id))
    );

    setName(studentRes.data.full_name ?? "");
    setParentPhone(studentRes.data.parent_phone ?? "");
    setBirthDate(studentRes.data.birth_date ?? "");
    setJoinDate(studentRes.data.join_date ?? "");
    setBranchId(studentRes.data.branch_id ?? "");
    setStatus(studentRes.data.status ?? "active");
    if (currentTuitionRes.error) {
      console.error(currentTuitionRes.error);
      setCurrentTuition([]);
    } else {
      setCurrentTuition(currentTuitionRes.data ?? []);
    }

    setCurrentTuitionLoading(false);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => { void loadAvatarAccess(); }, [loadAvatarAccess]);

  async function saveAvatar(blob: Blob) {
    const freshUrl = await uploadStudentAvatar(supabase, id, blob);
    if (!freshUrl) throw new Error("Không tạo được liên kết ảnh mới.");
    setAvatarUrl(freshUrl);
    setAvatarFile(null);
  }

  // THÊM LỚP: mọi cơ sở, không giới hạn theo students.branch_id.
  const availableClassesForAdd = useMemo(() => {
    const currentIds = new Set(classes.map((item) => item.id));
    return allClasses.filter(
      (item) => item.status === "active" && !currentIds.has(item.id)
    );
  }, [allClasses, classes]);

  // CHUYỂN LỚP: mọi cơ sở; loại lớp hiện tại và các lớp đang active.
  const availableClassesForTransfer = useMemo(() => {
    const currentIds = new Set(classes.map((item) => item.id));
    return allClasses.filter(
      (item) =>
        item.status === "active" &&
        item.id !== transferFromClass &&
        !currentIds.has(item.id)
    );
  }, [allClasses, classes, transferFromClass]);

  const adjustmentByTuition = useMemo(() => {
    const map = new Map<string, { transferable: number; cancellable: number }>();

    for (const tuition of tuitionList) {
      map.set(tuition.id, {
        transferable: Number(tuition.amount_paid || 0),
        cancellable: Math.max(
          Number(tuition.amount_due || 0) - Number(tuition.amount_paid || 0),
          0
        ),
      });
    }

    for (const item of adjustments) {
      const current = map.get(item.tuition_id);
      if (!current) continue;

      if (
        item.action === "reserve" ||
        item.action === "refund" ||
        item.action === "carry_forward"
      ) {
        current.transferable = Math.max(
          current.transferable - Number(item.amount || 0),
          0
        );
      }

      if (item.action === "cancel") {
        current.cancellable = Math.max(
          current.cancellable - Number(item.amount || 0),
          0
        );
      }
    }

    return map;
  }, [tuitionList, adjustments]);

  const totalPaid = useMemo(
    () => tuitionList.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0),
    [tuitionList]
  );

  const totalDue = useMemo(
    () => tuitionList.reduce((sum, item) => sum + Number(item.amount_due || 0), 0),
    [tuitionList]
  );

  const totalTransferable = useMemo(
    () =>
      tuitionList.reduce(
        (sum, item) => sum + (adjustmentByTuition.get(item.id)?.transferable ?? 0),
        0
      ),
    [tuitionList, adjustmentByTuition]
  );

  const totalCancellable = useMemo(
    () =>
      tuitionList.reduce(
        (sum, item) => sum + (adjustmentByTuition.get(item.id)?.cancellable ?? 0),
        0
      ),
    [tuitionList, adjustmentByTuition]
  );

  async function openSuspendModal() {
    setTuitionLoading(true);

    const [tuitionRes, adjustmentRes] = await Promise.all([
      supabase
        .from("tuition")
        .select("id,billing_month,amount_due,amount_paid,status")
        .eq("student_id", id)
        .order("billing_month", { ascending: true }),
      supabase
        .from("tuition_adjustments")
        .select("id,tuition_id,action,amount")
        .eq("student_id", id),
    ]);

    setTuitionLoading(false);

    if (tuitionRes.error) {
      alert("Không thể kiểm tra học phí: " + tuitionRes.error.message);
      setStatus("active");
      return;
    }

    if (adjustmentRes.error) {
      alert(
        "Không thể kiểm tra lịch sử xử lý học phí: " +
          adjustmentRes.error.message
      );
      setStatus("active");
      return;
    }

    setTuitionList(tuitionRes.data ?? []);
    setAdjustments(adjustmentRes.data ?? []);
    setAdjustmentAction("none");
    setAdjustmentAmount("");
    setAdjustmentMonth("");
    setAdjustmentNote("");
    setSuspendModal(true);
  }

  async function updateStudentStatusOnly() {
    setSaving(true);

    const { error } = await supabase
      .from("students")
      .update({
        full_name: name.trim(),
        branch_id: branchId || null,
        status,
        parent_phone: parentPhone.trim() || null,
        birth_date: birthDate || null,
        join_date: joinDate || null,
      })
      .eq("id", id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return false;
    }

    setSuspendModal(false);
    await loadData();
    router.replace(detailPath);
    return true;
  }

  async function processSuspension() {
    if (adjustmentAction === "none") {
      await updateStudentStatusOnly();
      return;
    }

    const amount = Number(adjustmentAmount || 0);
    const available =
      adjustmentAction === "cancel" ? totalCancellable : totalTransferable;

    if (amount <= 0) {
      alert("Vui lòng nhập số tiền cần xử lý.");
      return;
    }

    if (amount > available) {
      alert(
        `Số tiền xử lý không được vượt quá số tiền còn có thể xử lý: ${new Intl.NumberFormat(
          "vi-VN"
        ).format(Math.round(available))}đ.`
      );
      return;
    }

    if (adjustmentAction === "carry_forward" && !adjustmentMonth) {
      alert("Vui lòng chọn tháng chuyển sang.");
      return;
    }

    setProcessingAdjustment(true);

    try {
      let targetTuitionId: string | null = null;

      if (adjustmentAction === "carry_forward") {
        const { data, error } = await supabase
          .from("tuition")
          .select("id")
          .eq("student_id", id)
          .eq("billing_month", adjustmentMonth)
          .maybeSingle();

        if (error) {
          throw new Error(
            "Không thể kiểm tra học phí tháng chuyển: " + error.message
          );
        }

        targetTuitionId = data?.id ?? null;
      }

      const sourceRows = tuitionList
        .map((tuition) => ({
          tuition,
          available:
            adjustmentAction === "cancel"
              ? adjustmentByTuition.get(tuition.id)?.cancellable ?? 0
              : adjustmentByTuition.get(tuition.id)?.transferable ?? 0,
        }))
        .filter((row) => row.available > 0)
        .sort((a, b) =>
          a.tuition.billing_month.localeCompare(b.tuition.billing_month)
        );

      let remaining = amount;

      const rowsToInsert: Array<{
        tuition_id: string;
        student_id: string;
        action: AdjustmentAction;
        amount: number;
        target_tuition_id: string | null;
        target_month: string | null;
        note: string | null;
      }> = [];

      for (const row of sourceRows) {
        if (remaining <= 0) break;

        const applied = Math.min(remaining, row.available);

        rowsToInsert.push({
          tuition_id: row.tuition.id,
          student_id: id,
          action: adjustmentAction,
          amount: applied,
          target_tuition_id: targetTuitionId,
          target_month:
            adjustmentAction === "carry_forward" ? adjustmentMonth : null,
          note: adjustmentNote.trim() || null,
        });

        remaining -= applied;
      }

      if (remaining > 0) {
        throw new Error(
          "Không thể phân bổ đủ số tiền xử lý vào các khoản học phí."
        );
      }

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      }

      const rowsWithProcessor = rowsToInsert.map((row) => ({
        ...row,
        processed_by: currentUser.id,
      }));

      const { error: insertError } = await supabase
        .from("tuition_adjustments")
        .insert(rowsWithProcessor);

      if (insertError) {
        throw new Error(insertError.message);
      }

      await updateStudentStatusOnly();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Có lỗi xảy ra khi xử lý."
      );
    } finally {
      setProcessingAdjustment(false);
    }
  }

  async function saveStudent() {
    if (!name.trim()) {
      alert("Vui lòng nhập tên học viên.");
      return;
    }

    if (student?.status === "active" && status === "inactive") {
      await openSuspendModal();
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("students")
      .update({
        full_name: name.trim(),
        branch_id: branchId || null,
        status,
        parent_phone: parentPhone.trim() || null,
        birth_date: birthDate || null,
        join_date: joinDate || null,
      })
      .eq("id", id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
    router.replace(detailPath);
  }

  async function addClass() {
    if (!selectedClass) {
      alert("Vui lòng chọn lớp.");
      return;
    }

    setAddingClass(true);

    try {
      const { data: existing, error: lookupError } = await supabase
        .from("class_students")
        .select("class_id,status")
        .eq("student_id", id)
        .eq("class_id", selectedClass)
        .maybeSingle();

      if (lookupError) {
        throw new Error("Không kiểm tra được lớp: " + lookupError.message);
      }

      if (existing?.status === "active") {
        throw new Error("Học viên đã đang học lớp này.");
      }

      const startDate = vietnamToday();

      const result = existing
        ? await supabase
            .from("class_students")
            .update({
              status: "active",
              start_date: startDate,
              end_date: null,
            })
            .eq("student_id", id)
            .eq("class_id", selectedClass)
        : await supabase.from("class_students").insert({
            student_id: id,
            class_id: selectedClass,
            status: "active",
            start_date: startDate,
            end_date: null,
          });

      if (result.error) {
        throw new Error(result.error.message);
      }

      setSelectedClass("");
      await loadData();
    } catch (error) {
      alert(
        "❌ Không thể thêm lớp: " +
          (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setAddingClass(false);
    }
  }

  async function transferClass() {
    if (!transferFromClass || !transferToClass) {
      alert("Vui lòng chọn lớp cũ và lớp mới.");
      return;
    }

    const fromClass = classes.find(
      (item) => item.id === transferFromClass
    );

    const toClass = allClasses.find(
      (item) => item.id === transferToClass
    );

    if (!fromClass || !toClass) {
      alert("Không tìm thấy lớp cần chuyển.");
      return;
    }

    if (fromClass.id === toClass.id) {
      alert("Lớp mới phải khác lớp hiện tại.");
      return;
    }

    if (toClass.status !== "active") {
      alert("Lớp mới hiện không ACTIVE.");
      return;
    }

    const ok = confirm(
      `🔄 CHUYỂN LỚP\n\n` +
      `Học viên: ${student?.full_name ?? ""}\n` +
      `Từ: ${fromClass.name}\n` +
      `Sang: ${toClass.name}\n\n` +
      `Lớp cũ sẽ được lưu lịch sử.\n` +
      `Lớp mới sẽ được kích hoạt.\n` +
      `Không tạo học phí mới.\n\n` +
      `Xác nhận chuyển?`
    );

    if (!ok) return;

    setTransferring(true);

    try {
      // DB tự lấy ngày Việt Nam từ RPC.
      // Toàn bộ thao tác chuyển lớp chạy trong 1 transaction.
      const { data, error } = await supabase.rpc(
        "transfer_student_class",
        {
          p_student_id: id,
          p_source_class_id: fromClass.id,
          p_target_class_id: toClass.id,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success) {
        throw new Error("RPC không xác nhận chuyển lớp thành công.");
      }

      setTransferFromClass(null);
      setTransferToClass("");

      await loadData();

      alert(
        `✅ CHUYỂN LỚP THÀNH CÔNG!\n\n` +
        `Học viên: ${student?.full_name ?? ""}\n` +
        `Từ: ${fromClass.name}\n` +
        `Sang: ${toClass.name}\n\n` +
        `✓ Lớp cũ đã lưu lịch sử\n` +
        `✓ Lớp mới đã ACTIVE\n` +
        `✓ Không tạo học phí mới`
      );
    } catch (error) {
      alert(
        `❌ CHUYỂN LỚP THẤT BẠI:\n\n` +
        (error instanceof Error
          ? error.message
          : String(error))
      );
    } finally {
      setTransferring(false);
    }
  }

  async function removeClass(classId: string) {
    if (!confirm("Xóa học viên khỏi lớp này? Học viên vẫn được giữ lại.")) {
      return;
    }

    const { error } = await supabase
      .from("class_students")
      .delete()
      .eq("student_id", id)
      .eq("class_id", classId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  if (loading) {
    return (
      <div className="min-w-0 space-y-3" aria-label="Đang tải hồ sơ học viên">
        <div className="abk-skeleton h-24" />
        <div className="abk-skeleton h-36" />
        <div className="abk-skeleton h-52" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="ui-card p-12 text-center">
        <div className="text-5xl">😕</div>
        <h1 className="mt-4 text-xl font-black">
          Không tìm thấy học viên
        </h1>
        <Link
          href={returnPath}
          className="ui-btn ui-btn-primary mt-5 inline-flex"
        >
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  const branch = branches.find((item) => item.id === student.branch_id);
  const active = student.status === "active";
  const currentMonth = vietnamCurrentMonth();
  const currentMonthDue = currentTuition.reduce(
    (sum, item) => sum + Number(item.amount_due || 0),
    0
  );
  const currentMonthPaid = currentTuition.reduce(
    (sum, item) => sum + Number(item.amount_paid || 0),
    0
  );
  const currentMonthRemaining = Math.max(currentMonthDue - currentMonthPaid, 0);
  const currentMonthLabel = `Tháng ${Number(currentMonth.split("-")[1])}/${currentMonth.split("-")[0]}`;
  const tuitionHref = `/tuition?${new URLSearchParams({ studentId: id, month: currentMonth })}`;

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      {avatarFile ? <StudentAvatarEditor file={avatarFile} onCancel={() => setAvatarFile(null)} onRetake={setAvatarFile} onSave={saveAvatar} /> : null}
      <section className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href={returnPath}
            className="inline-flex min-h-11 items-center text-sm font-bold text-blue-600 hover:underline"
          >
            ← Học viên
          </Link>

          <div className="mt-2 grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-3 sm:mt-3 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-4">
            <StudentAvatar name={student.full_name} url={avatarUrl} size="detail" editable={canEditAvatar} onPhotoSelected={setAvatarFile} />

            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                HỒ SƠ HỌC VIÊN
              </div>
              <h1 className="mt-1 break-words text-2xl font-black tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
                {student.full_name}
              </h1>
              <div className="mt-1 break-all text-sm font-black tracking-wide text-blue-600">
                {student.student_code}
              </div>
            </div>
          </div>
        </div>

      {!editMode && (
          <Link
            href={editPath}
            className="ui-btn ui-btn-blue flex min-h-12 w-full items-center justify-center gap-2 sm:w-fit"
          >
            ✏️ Sửa hồ sơ
          </Link>
        )}
      </section>

      {editMode ? (
        <section className="ui-card p-6 sm:p-7">
          <div className="mb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
              CẬP NHẬT
            </div>
            <h2 className="mt-1 text-2xl font-black">
              Thông tin học viên
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="mb-2 text-sm font-bold text-slate-700">
                Họ và tên
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ui-input"
              />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold text-slate-700">
                SĐT phụ huynh
              </div>
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                placeholder="0901 234 567"
                className="ui-input"
              />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold text-slate-700">
                Ngày sinh
              </div>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="ui-input"
              />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold text-slate-700">
                Ngày vào học
              </div>
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                className="ui-input"
              />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold text-slate-700">
                Cơ sở
              </div>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="ui-input"
              >
                <option value="">Chưa gán cơ sở</option>
                {branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-bold text-slate-700">
                Trạng thái
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="ui-input"
              >
                <option value="active">🟢 Đang học</option>
                <option value="inactive">⚪ Tạm ngưng</option>
              </select>
            </label>
          </div>

          <div className="mt-7 flex justify-end gap-3 border-t border-slate-100 pt-5">
            <Link
              href={detailPath}
              className="ui-btn ui-btn-light"
            >
              Hủy
            </Link>

            <button
              onClick={saveStudent}
              disabled={saving}
              className="ui-btn ui-btn-primary min-w-[140px]"
            >
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </section>
      ) : (
          <section className="ui-card min-w-0 p-4 sm:p-6">
            <h2 className="text-xl font-black">Thông tin học viên</h2>
            <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 min-[390px]:grid-cols-2 lg:grid-cols-3">
              {[
                ["Mã học viên", student.student_code],
                ["Trạng thái", active ? "🟢 Đang học" : "⚪ Tạm ngưng"],
                ["Ngày sinh", student.birth_date ? new Date(student.birth_date + "T00:00:00").toLocaleDateString("vi-VN") : "Chưa cập nhật"],
                ["SĐT phụ huynh", student.parent_phone || "Chưa cập nhật"],
                ["Cơ sở", branch?.name || "Chưa gán cơ sở"],
                ["Ngày vào học", student.join_date ? new Date(student.join_date + "T00:00:00").toLocaleDateString("vi-VN") : "Chưa cập nhật"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 border-b border-slate-100 pb-3 last:border-b-0 min-[390px]:last:border-b">
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="mt-1 break-words font-black text-slate-800 [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
      )}

      <section className="ui-card min-w-0 p-4 sm:p-6">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-black">💰 Học phí tháng này</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{currentMonthLabel}</p>
              </div>
              <Link href={tuitionHref} className="ui-btn ui-btn-blue flex min-h-11 shrink-0 items-center justify-center">Xem học phí →</Link>
            </div>

            {currentTuitionLoading ? (
              <div className="mt-4 text-sm text-slate-400">Đang tải học phí...</div>
            ) : currentTuition.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 font-bold text-slate-500">Chưa có học phí tháng này</div>
            ) : (
              <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="min-w-0 rounded-2xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-400">Phải thu</div><div className="mt-1 break-words font-black">{new Intl.NumberFormat("vi-VN").format(currentMonthDue)} đ</div></div>
                <div className="min-w-0 rounded-2xl bg-emerald-50 p-3"><div className="text-xs font-bold text-slate-400">Đã đóng</div><div className="mt-1 break-words font-black text-emerald-700">{new Intl.NumberFormat("vi-VN").format(currentMonthPaid)} đ</div></div>
                <div className="min-w-0 rounded-2xl bg-rose-50 p-3"><div className="text-xs font-bold text-slate-400">Còn lại</div><div className="mt-1 break-words font-black text-rose-600">{new Intl.NumberFormat("vi-VN").format(currentMonthRemaining)} đ</div></div>
                <div className="col-span-2 min-w-0 rounded-2xl bg-blue-50 p-3 lg:col-span-1"><div className="text-xs font-bold text-slate-400">Trạng thái</div><div className={`mt-1 font-black ${currentMonthRemaining === 0 ? "text-emerald-700" : "text-amber-700"}`}>{currentMonthRemaining === 0 ? "Đã đóng đủ" : "Chưa đóng đủ"}</div></div>
              </div>
            )}
      </section>

      <section className="ui-card min-w-0 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black">
                  📚 Các lớp đang học
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Một học viên có thể học nhiều lớp
                </p>
              </div>

              <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">
                {classes.length} lớp
              </span>
            </div>

            <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-[22px] bg-slate-50/80 p-3 sm:flex-row sm:p-4">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="ui-input min-w-0 flex-1"
              >
                <option value="">＋ Chọn lớp để thêm...</option>
                {availableClassesForAdd.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} —{" "}
                    {new Intl.NumberFormat("vi-VN").format(
                      Number(item.monthly_fee)
                    )}{" "}
                    đ/tháng
                  </option>
                ))}
              </select>

              <button
                onClick={addClass}
                disabled={addingClass || !selectedClass}
                className="ui-btn ui-btn-primary min-h-12 whitespace-nowrap"
              >
                {addingClass ? "Đang thêm..." : "＋ Thêm vào lớp"}
              </button>
            </div>

            {classes.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">
                Học viên chưa tham gia lớp nào.
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {classes.map((item) => (
                  <div
                    key={item.id}
                    className="group min-w-0 rounded-[22px] bg-white p-4 shadow-[0_7px_18px_rgba(35,50,75,.07)] transition hover:-translate-y-1 hover:shadow-[0_13px_25px_rgba(35,50,75,.11)]"
                  >
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:gap-3">
                      <Link
                        href={`/branches/${item.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl">
                          💃
                        </div>

                        <div className="min-w-0">
                          <div className="break-words font-black [overflow-wrap:anywhere]">
                            {item.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            💰{" "}
                            {new Intl.NumberFormat("vi-VN").format(
                              Number(item.monthly_fee)
                            )}{" "}
                            đ/tháng
                          </div>
                        </div>
                      </Link>

                      <button
                        onClick={() => {
                          setTransferFromClass(item.id);
                          setTransferToClass("");
                        }}
                        className="flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 px-2 text-xs font-black text-blue-700 shadow-none transition hover:bg-blue-100 sm:px-3"
                        title="Chuyển sang lớp khác"
                      >
                        🔄 Chuyển
                      </button>

                      <button
                        onClick={() => removeClass(item.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-50 text-sm shadow-none transition hover:bg-rose-100"
                        aria-label={`Xóa ${item.name} khỏi danh sách lớp đang học`}
                        title="Xóa khỏi lớp"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {transferFromClass && (
              <div className="mt-5 rounded-[22px] border border-blue-100 bg-blue-50/60 p-5">
                <div className="text-sm font-black text-blue-900">🔄 Chuyển lớp</div>
                <div className="mt-1 text-xs text-blue-700">Lớp cũ vẫn được giữ trong lịch sử; chỉ trạng thái lớp đang học được chuyển.</div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <select
                    value={transferToClass}
                    onChange={(e) => setTransferToClass(e.target.value)}
                    className="ui-input flex-1"
                    disabled={transferring}
                  >
                    <option value="">＋ Chọn lớp mới...</option>
                    {availableClassesForTransfer.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {new Intl.NumberFormat("vi-VN").format(Number(item.monthly_fee))} đ/tháng
                        </option>
                      ))}
                  </select>

                  <button
                    onClick={transferClass}
                    disabled={transferring || !transferToClass}
                    className="ui-btn ui-btn-primary whitespace-nowrap"
                  >
                    {transferring ? "Đang chuyển..." : "Xác nhận chuyển lớp"}
                  </button>

                  <button
                    onClick={() => {
                      setTransferFromClass(null);
                      setTransferToClass("");
                    }}
                    disabled={transferring}
                    className="ui-btn ui-btn-light whitespace-nowrap"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
      </section>
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  TẠM NGƯNG HỌC VIÊN
                </div>
                <h2 className="mt-1 text-2xl font-black">
                  Xử lý học phí của {student.full_name}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Chọn cách xử lý tiền đã thu hoặc phần chưa thanh toán.
                  Hệ thống không xóa lịch sử học phí.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSuspendModal(false);
                  setStatus("active");
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100"
              >
                ✕
              </button>
            </div>

            {tuitionLoading ? (
              <div className="py-10 text-center text-slate-400">
                Đang kiểm tra học phí...
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-bold text-slate-400">Tổng phải thu</div>
                    <div className="mt-1 text-lg font-black">
                      {new Intl.NumberFormat("vi-VN").format(Math.round(totalDue))}đ
                    </div>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <div className="text-xs font-bold text-slate-400">Đã thu</div>
                    <div className="mt-1 text-lg font-black text-emerald-600">
                      {new Intl.NumberFormat("vi-VN").format(Math.round(totalPaid))}đ
                    </div>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-4">
                    <div className="text-xs font-bold text-slate-400">Chưa thu</div>
                    <div className="mt-1 text-lg font-black text-rose-600">
                      {new Intl.NumberFormat("vi-VN").format(
                        Math.round(Math.max(totalDue - totalPaid, 0))
                      )}đ
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-100">
                  <div className="border-b border-slate-100 px-4 py-3 text-sm font-black">
                    Các khoản học phí
                  </div>

                  {tuitionList.length === 0 ? (
                    <div className="p-5 text-sm text-slate-400">
                      Học viên chưa có khoản học phí nào.
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-auto">
                      {tuitionList.map((item) => {
                        const info = adjustmentByTuition.get(item.id);
                        const transferable = info?.transferable ?? 0;
                        const cancellable = info?.cancellable ?? 0;

                        return (
                          <div
                            key={item.id}
                            className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="font-bold">
                                Tháng{" "}
                                {new Date(item.billing_month + "T00:00:00").toLocaleDateString(
                                  "vi-VN",
                                  { month: "2-digit", year: "numeric" }
                                )}
                              </div>
                              <div className="text-xs text-slate-400">
                                Đã thu{" "}
                                {new Intl.NumberFormat("vi-VN").format(
                                  Math.round(Number(item.amount_paid || 0))
                                )}
                                đ · Còn thiếu{" "}
                                {new Intl.NumberFormat("vi-VN").format(
                                  Math.round(
                                    Math.max(
                                      Number(item.amount_due || 0) -
                                        Number(item.amount_paid || 0),
                                      0
                                    )
                                  )
                                )}
                                đ
                              </div>
                            </div>
                            <div className="text-left text-xs sm:text-right">
                              <div className="font-bold">
                                Có thể xử lý đã thu:{" "}
                                {new Intl.NumberFormat("vi-VN").format(
                                  Math.round(transferable)
                                )}
                                đ
                              </div>
                              <div className="text-slate-400">
                                Có thể hủy chưa thu:{" "}
                                {new Intl.NumberFormat("vi-VN").format(
                                  Math.round(cancellable)
                                )}
                                đ
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-5 grid gap-3">
                  {[
                    ["reserve", "🟡 Bảo lưu", "Giữ tiền đã đóng làm số dư để sử dụng khi học lại.", "border-amber-400 bg-amber-50"],
                    ["refund", "💸 Hoàn tiền", "Ghi nhận khoản hoàn tiền, không xóa giao dịch đã thu.", "border-rose-400 bg-rose-50"],
                    ["carry_forward", "🔄 Chuyển sang tháng sau", "Giữ tiền đã đóng để trừ vào học phí của tháng được chọn.", "border-blue-400 bg-blue-50"],
                    ["cancel", "❌ Hủy phần chưa thanh toán", "Chỉ xử lý phần còn chưa thu.", "border-slate-400 bg-slate-100"],
                    ["none", "⚪ Không xử lý", "Chỉ tạm ngưng và giữ nguyên học phí.", "border-slate-400 bg-slate-100"],
                  ].map(([action, title, description, selectedClass]) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setAdjustmentAction(action as AdjustmentAction)}
                      className={`rounded-2xl border p-4 text-left ${
                        adjustmentAction === action
                          ? selectedClass
                          : "border-slate-200"
                      }`}
                    >
                      <div className="font-black">{title}</div>
                      <div className="mt-1 text-sm text-slate-500">{description}</div>
                    </button>
                  ))}
                </div>

                {adjustmentAction !== "none" && (
                  <div className="mt-5 space-y-4 rounded-2xl bg-slate-50 p-4">
                    <div>
                      <div className="text-sm font-bold">Số tiền cần xử lý</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Tối đa:{" "}
                        {new Intl.NumberFormat("vi-VN").format(
                          Math.round(
                            adjustmentAction === "cancel"
                              ? totalCancellable
                              : totalTransferable
                          )
                        )}
                        đ
                      </div>
                    </div>

                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      placeholder="Nhập số tiền"
                      className="ui-input"
                    />

                    {adjustmentAction === "carry_forward" && (
                      <label className="block">
                        <div className="mb-2 text-sm font-bold">Chuyển sang tháng</div>
                        <input
                          type="month"
                          value={adjustmentMonth.slice(0, 7)}
                          onChange={(e) =>
                            setAdjustmentMonth(
                              e.target.value ? `${e.target.value}-01` : ""
                            )
                          }
                          className="ui-input"
                        />
                      </label>
                    )}

                    <label className="block">
                      <div className="mb-2 text-sm font-bold">Ghi chú</div>
                      <textarea
                        value={adjustmentNote}
                        onChange={(e) => setAdjustmentNote(e.target.value)}
                        placeholder="Ví dụ: Tạm ngưng từ tháng 10..."
                        className="ui-input min-h-[90px]"
                      />
                    </label>
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setSuspendModal(false);
                      setStatus("active");
                    }}
                    className="ui-btn ui-btn-light"
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    onClick={processSuspension}
                    disabled={processingAdjustment || saving}
                    className="ui-btn ui-btn-primary min-w-[170px]"
                  >
                    {processingAdjustment || saving
                      ? "Đang xử lý..."
                      : "Xác nhận tạm ngưng"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}


export default function StudentDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="ui-card p-6 text-slate-500">
          Đang tải hồ sơ học viên...
        </div>
      }
    >
      <StudentDetailContent />
    </Suspense>
  );
}
