from pathlib import Path
import shutil

path = Path("app/dashboard/page.tsx")
backup = Path("app/dashboard/page.tsx.before-refund-v1-fix")

if not path.exists():
    raise SystemExit(f"Không tìm thấy file: {path}")

if not backup.exists():
    shutil.copy2(path, backup)

s = path.read_text(encoding="utf-8")

if "adjustmentsRes" not in s:
    raise SystemExit("Không thấy adjustmentsRes trong file hiện tại.")

if '.from("tuition_adjustments")' not in s:
    marker = """        supabase
          .from("expenses")
          .select("id,amount,expense_date,category,description")
          .order("expense_date", { ascending: false })
          .limit(100),
      ]);
"""
    replacement = """        supabase
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
    if marker not in s:
        raise SystemExit("Không tìm thấy vị trí Promise.all để chèn query refund.")
    s = s.replace(marker, replacement, 1)
    path.write_text(s, encoding="utf-8")

print("PATCH_DASHBOARD_REFUND_V1_FIX_OK")
print(f"File: {path}")
print(f"Backup: {backup}")
