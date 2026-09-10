#!/usr/bin/env python3
from pathlib import Path
import shutil

path = Path("app/students/[id]/page.tsx")
backup = Path("app/students/[id]/page.tsx.before-suspension")

if not path.exists():
    raise SystemExit(f"Không tìm thấy {path}")

shutil.copy2(path, backup)
text = path.read_text()

if "type Tuition = {" not in text:
    anchor = """type DanceClass = {
  id: string;
  name: string;
  branch_id: string;
  monthly_fee: number;
  status: string;
};
"""
    insert = anchor + """
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
"""
    if anchor not in text:
        raise SystemExit("Không tìm thấy type DanceClass.")
    text = text.replace(anchor, insert, 1)

if "const [suspendModal" not in text:
    anchor = """  const [status, setStatus] = useState("active");
"""
    insert = anchor + """
  const [suspendModal, setSuspendModal] = useState(false);
  const [tuitionLoading, setTuitionLoading] = useState(false);
  const [tuitionList, setTuitionList] = useState<Tuition[]>([]);
  const [adjustments, setAdjustments] = useState<TuitionAdjustment[]>([]);
  const [adjustmentAction, setAdjustmentAction] =
    useState<AdjustmentAction>("none");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentMonth, setAdjustmentMonth] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [processingAdjustment, setProcessingAdjustment] = useState(false);
"""
    if anchor not in text:
        raise SystemExit("Không tìm thấy state status.")
    text = text.replace(anchor, insert, 1)

if "async function openSuspendModal()" not in text:
    anchor = """  async function saveStudent() {
"""
    insert = r"""  const adjustmentByTuition = useMemo(() => {
    const map = new Map<
      string,
      { transferable: number; cancellable: number }
    >();

    for (const tuition of tuitionList) {
      map.set(tuition.id, {
        transferable: Number(tuition.amount_paid || 0),
        cancellable: Math.max(
          Number(tuition.amount_due || 0) -
            Number(tuition.amount_paid || 0),
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
    () =>
      tuitionList.reduce(
        (sum, item) => sum + Number(item.amount_paid || 0),
        0
      ),
    [tuitionList]
  );

  const totalDue = useMemo(
    () =>
      tuitionList.reduce(
        (sum, item) => sum + Number(item.amount_due || 0),
        0
      ),
    [tuitionList]
  );

  const totalTransferable = useMemo(
    () =>
      tuitionList.reduce(
        (sum, item) =>
          sum + (adjustmentByTuition.get(item.id)?.transferable ?? 0),
        0
      ),
    [tuitionList, adjustmentByTuition]
  );

  const totalCancellable = useMemo(
    () =>
      tuitionList.reduce(
        (sum, item) =>
          sum + (adjustmentByTuition.get(item.id)?.cancellable ?? 0),
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
    router.replace(`/students/${id}`);
    return true;
  }

  async function processSuspension() {
    if (adjustmentAction === "none") {
      await updateStudentStatusOnly();
      return;
    }

    const amount = Number(adjustmentAmount || 0);
    const available =
      adjustmentAction === "cancel"
        ? totalCancellable
        : totalTransferable;

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

      const { error: insertError } = await supabase
        .from("tuition_adjustments")
        .insert(rowsToInsert);

      if (insertError) {
        throw new Error(insertError.message);
      }

      await updateStudentStatusOnly();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Có lỗi xảy ra khi xử lý."
      );
    } finally {
      setProcessingAdjustment(false);
    }
  }

"""
    if anchor not in text:
        raise SystemExit("Không tìm thấy saveStudent.")
    text = text.replace(anchor, insert + anchor, 1)

if 'student?.status === "active" && status === "inactive"' not in text:
    old = """    setSaving(true);
    const { error } = await supabase
      .from("students")
"""
    new = """    if (student?.status === "active" && status === "inactive") {
      await openSuspendModal();
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("students")
"""
    if old not in text:
        raise SystemExit("Không tìm thấy đoạn saveStudent cần chặn.")
    text = text.replace(old, new, 1)

if "{suspendModal && (" not in text:
    modal = r"""      {suspendModal && (
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
"""
    marker = "\n    </div>\n  );\n}"
    pos = text.rfind(marker)
    if pos == -1:
        raise SystemExit("Không tìm thấy điểm cuối JSX.")
    text = text[:pos] + "\n" + modal + text[pos:]

path.write_text(text)
print("PATCH_OK")
print(path)
print(backup)
