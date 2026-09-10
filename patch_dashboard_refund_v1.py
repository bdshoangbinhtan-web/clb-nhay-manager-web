from pathlib import Path
import shutil

path = Path("app/dashboard/page.tsx")
backup = Path("app/dashboard/page.tsx.before-refund-v1")

if not path.exists():
    raise SystemExit(f"Không tìm thấy file: {path}")

if not backup.exists():
    shutil.copy2(path, backup)

s = path.read_text(encoding="utf-8")

old = """type Expense = {
  id: string;
  amount: number;
  expense_date: string;
  category: string;
  description: string | null;
};
"""
new = """type Expense = {
  id: string;
  amount: number;
  expense_date: string;
  category: string;
  description: string | null;
};

type TuitionAdjustment = {
  id: string;
  student_id: string;
  action: string;
  amount: number;
  created_at: string;
};
"""
if old not in s:
    raise SystemExit("Không tìm thấy Expense type.")
s = s.replace(old, new, 1)

old = """  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
"""
new = """  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [adjustments, setAdjustments] = useState<TuitionAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
"""
if old not in s:
    raise SystemExit("Không tìm thấy state payments/expenses.")
s = s.replace(old, new, 1)

old = """        supabase
          .from("expenses")
          .select("id,amount,expense_date,category,description")
          .order("expense_date", { ascending: false })
          .limit(100),
      ]);
"""
new = """        supabase
          .from("expenses")
          .select("id,amount,expense_date,category,description")
          .order("expense_date", { ascending: false })
          .limit(100),
        supabase
          .from("tuition_adjustments")
          .select("id,student_id,action,amount,created_at")
          .eq("action", "refund")
          .order("created_at", { ascending: false }),
      ]);
"""
if old not in s:
    raise SystemExit("Không tìm thấy query expenses.")
s = s.replace(old, new, 1)

old = """    if (paymentsRes.error) console.error(paymentsRes.error);
    if (expensesRes.error) console.error(expensesRes.error);

    setStudents(studentsRes.data ?? []);
"""
new = """    if (paymentsRes.error) console.error(paymentsRes.error);
    if (expensesRes.error) console.error(expensesRes.error);
    if (adjustmentsRes.error) console.error(adjustmentsRes.error);

    setStudents(studentsRes.data ?? []);
"""
if old not in s:
    raise SystemExit("Không tìm thấy error logging.")
s = s.replace(old, new, 1)

old = """    setPayments(paymentsRes.data ?? []);
    setExpenses(expensesRes.data ?? []);
    setLoading(false);
"""
new = """    setPayments(paymentsRes.data ?? []);
    setExpenses(expensesRes.data ?? []);
    setAdjustments((adjustmentsRes.data ?? []) as TuitionAdjustment[]);
    setLoading(false);
"""
if old not in s:
    raise SystemExit("Không tìm thấy setPayments/setExpenses.")
s = s.replace(old, new, 1)

old = """  const revenue = monthPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = monthExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const balance = revenue - expenseTotal;
"""
new = """  const revenue = monthPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const refundTotal = adjustments.reduce((sum, item) => {
    const d = new Date(item.created_at);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      ? sum + Number(item.amount || 0)
      : sum;
  }, 0);
  const expenseTotal = monthExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const balance = revenue - refundTotal - expenseTotal;
"""
if old not in s:
    raise SystemExit("Không tìm thấy đoạn revenue/expense/balance.")
s = s.replace(old, new, 1)

path.write_text(s, encoding="utf-8")
print("PATCH_DASHBOARD_REFUND_V1_OK")
print(f"File: {path}")
print(f"Backup: {backup}")
