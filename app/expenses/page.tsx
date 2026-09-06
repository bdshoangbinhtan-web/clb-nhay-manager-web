"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  id: string;
  name: string;
};

type Expense = {
  id: string;
  branch_id: string | null;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  note: string | null;
};

const CATEGORIES = [
  ["rent", "🏠 Thuê mặt bằng"],
  ["salary", "👤 Lương"],
  ["utilities", "⚡ Điện nước"],
  ["equipment", "💻 Thiết bị"],
  ["marketing", "📣 Marketing"],
  ["other", "📦 Khác"],
];

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

function categoryLabel(value: string) {
  return CATEGORIES.find(([id]) => id === value)?.[1] ?? value;
}

export default function ExpensesPage() {
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [branchId, setBranchId] = useState("");
  const [category, setCategory] = useState("other");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [filterBranch, setFilterBranch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [search, setSearch] = useState("");

  async function loadData() {
    setLoading(true);

    const [
      { data: branchData, error: branchError },
      { data: expenseData, error: expenseError },
    ] = await Promise.all([
      supabase.from("branches").select("id,name").order("name"),
      supabase
        .from("expenses")
        .select(
          "id,branch_id,expense_date,category,description,amount,note"
        )
        .order("expense_date", { ascending: false }),
    ]);

    if (branchError) {
      alert(branchError.message);
      return;
    }

    if (expenseError) {
      alert(expenseError.message);
      return;
    }

    setBranches(branchData ?? []);
    setExpenses(expenseData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setEditingId(null);
    setBranchId("");
    setCategory("other");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setAmount("");
    setNote("");
  }

  function openAdd() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(item: Expense) {
    setEditingId(item.id);
    setBranchId(item.branch_id ?? "");
    setCategory(item.category);
    setExpenseDate(item.expense_date);
    setDescription(item.description);
    setAmount(String(item.amount));
    setNote(item.note ?? "");
    setShowForm(true);
  }

  async function saveExpense(e: React.FormEvent) {
    e.preventDefault();

    if (!description.trim()) {
      alert("Hãy nhập nội dung khoản chi.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      alert("Số tiền không hợp lệ.");
      return;
    }

    setSaving(true);

    const payload = {
      branch_id: branchId || null,
      expense_date: expenseDate,
      category,
      description: description.trim(),
      amount: Number(amount),
      note: note.trim() || null,
    };

    const result = editingId
      ? await supabase
          .from("expenses")
          .update(payload)
          .eq("id", editingId)
      : await supabase.from("expenses").insert(payload);

    setSaving(false);

    if (result.error) {
      alert(result.error.message);
      return;
    }

    alert(editingId ? "✅ Đã cập nhật khoản chi." : "✅ Đã thêm khoản chi.");

    resetForm();
    setShowForm(false);
    await loadData();
  }

  async function deleteExpense(item: Expense) {
    const ok = confirm(
      `Xóa khoản chi "${item.description}" - ${money(
        Number(item.amount)
      )}?`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", item.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      if (filterBranch && item.branch_id !== filterBranch) {
        return false;
      }

      if (filterCategory && item.category !== filterCategory) {
        return false;
      }

      if (
        filterMonth &&
        !item.expense_date.startsWith(filterMonth)
      ) {
        return false;
      }

      const q = search.trim().toLowerCase();

      if (
        q &&
        !item.description.toLowerCase().includes(q) &&
        !(item.note ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }

      return true;
    });
  }, [expenses, filterBranch, filterCategory, filterMonth, search]);

  const totalExpense = filteredExpenses.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  function branchName(id: string | null) {
    return (
      branches.find((branch) => branch.id === id)?.name ??
      "Chưa gán cơ sở"
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-blue-600">
            QUẢN LÝ TÀI CHÍNH
          </div>

          <h1 className="mt-1 text-4xl font-black tracking-tight">
            💸 Chi phí
          </h1>

          <p className="mt-2 text-slate-400">
            Theo dõi toàn bộ khoản chi của CLB
          </p>
        </div>

        <button className="ui-btn ui-btn-primary" onClick={openAdd}>
          + Thêm khoản chi
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">
            TỔNG CHI
          </div>
          <div className="mt-2 text-3xl font-black text-rose-500">
            {money(totalExpense)}
          </div>
        </div>

        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">
            SỐ KHOẢN CHI
          </div>
          <div className="mt-2 text-3xl font-black">
            {filteredExpenses.length}
          </div>
        </div>

        <div className="ui-card p-6">
          <div className="text-sm font-bold text-slate-400">
            KỲ ĐANG XEM
          </div>
          <div className="mt-2 text-3xl font-black">
            {filterMonth
              ? `${filterMonth.slice(5, 7)}/${filterMonth.slice(0, 4)}`
              : "Tất cả"}
          </div>
        </div>
      </section>

      {showForm && (
        <section className="ui-card p-6 sm:p-8">
          <div className="mb-6">
            <div className="text-xs font-black uppercase tracking-widest text-blue-600">
              {editingId ? "CHỈNH SỬA" : "THÊM MỚI"}
            </div>

            <h2 className="mt-1 text-2xl font-black">
              {editingId ? "Cập nhật khoản chi" : "Tạo khoản chi"}
            </h2>
          </div>

          <form
            onSubmit={saveExpense}
            className="grid gap-5 md:grid-cols-2"
          >
            <label>
              <div className="mb-2 text-sm font-bold">Cơ sở</div>

              <select
                className="ui-input"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">-- Chọn cơ sở --</option>

                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">Nhóm chi</div>

              <select
                className="ui-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">Ngày chi</div>

              <input
                type="date"
                className="ui-input"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </label>

            <label>
              <div className="mb-2 text-sm font-bold">Số tiền</div>

              <input
                type="number"
                min="0"
                step="1000"
                className="ui-input"
                placeholder="500000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>

            <label className="md:col-span-2">
              <div className="mb-2 text-sm font-bold">
                Nội dung khoản chi
              </div>

              <input
                className="ui-input"
                placeholder="Ví dụ: Tiền thuê mặt bằng tháng 9"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <label className="md:col-span-2">
              <div className="mb-2 text-sm font-bold">Ghi chú</div>

              <textarea
                className="ui-input"
                rows={3}
                placeholder="Thông tin thêm..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <div className="flex justify-end gap-3 md:col-span-2">
              <button
                type="button"
                className="ui-btn"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                Hủy
              </button>

              <button
                className="ui-btn ui-btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Đang lưu..."
                  : editingId
                  ? "💾 Lưu thay đổi"
                  : "💾 Lưu khoản chi"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="ui-card overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <div className="grid gap-4 md:grid-cols-4">
            <select
              className="ui-input"
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
            >
              <option value="">Tất cả cơ sở</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <select
              className="ui-input"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">Tất cả nhóm chi</option>
              {CATEGORIES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>

            <input
              type="month"
              className="ui-input"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            />

            <input
              className="ui-input"
              placeholder="🔎 Tìm nội dung..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            Đang tải dữ liệu...
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            Chưa có khoản chi trong bộ lọc hiện tại.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-left text-sm text-slate-400">
                  <th className="p-4">Ngày</th>
                  <th className="p-4">Cơ sở</th>
                  <th className="p-4">Nhóm</th>
                  <th className="p-4">Nội dung</th>
                  <th className="p-4 text-right">Số tiền</th>
                  <th className="p-4"></th>
                </tr>
              </thead>

              <tbody>
                {filteredExpenses.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-50"
                  >
                    <td className="p-4 whitespace-nowrap">
                      {new Date(
                        item.expense_date + "T00:00:00"
                      ).toLocaleDateString("vi-VN")}
                    </td>

                    <td className="p-4">
                      {branchName(item.branch_id)}
                    </td>

                    <td className="p-4 whitespace-nowrap">
                      {categoryLabel(item.category)}
                    </td>

                    <td className="p-4">
                      <div className="font-bold">
                        {item.description}
                      </div>

                      {item.note && (
                        <div className="mt-1 text-xs text-slate-400">
                          {item.note}
                        </div>
                      )}
                    </td>

                    <td className="p-4 text-right font-black text-rose-500 whitespace-nowrap">
                      {money(Number(item.amount))}
                    </td>

                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button
                          className="ui-btn"
                          onClick={() => openEdit(item)}
                        >
                          ✏️ Sửa
                        </button>

                        <button
                          className="ui-btn bg-rose-50 text-rose-600"
                          onClick={() => deleteExpense(item)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-slate-50">
                  <td
                    colSpan={4}
                    className="p-4 text-right font-black"
                  >
                    TỔNG CHI
                  </td>

                  <td className="p-4 text-right text-lg font-black text-rose-500">
                    {money(totalExpense)}
                  </td>

                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
