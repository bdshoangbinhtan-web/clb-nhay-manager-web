from pathlib import Path
import shutil

path = Path("app/dashboard/page.tsx")
backup = Path("app/dashboard/page.tsx.before-refund-fix-final")

if not path.exists():
    raise SystemExit("Không tìm thấy app/dashboard/page.tsx")

if not backup.exists():
    shutil.copy2(path, backup)

s = path.read_text(encoding="utf-8")

if 'from("tuition_adjustments")' in s:
    print("QUERY_ALREADY_PRESENT")
else:
    marker = '''          .limit(100),
      ]);
'''
    replacement = '''          .limit(100),
        supabase
          .from("tuition_adjustments")
          .select("id,student_id,action,amount,created_at")
          .eq("action", "refund")
          .order("created_at", { ascending: false }),
      ]);
'''
    if marker not in s:
        raise SystemExit("Không tìm thấy vị trí query expenses trong Dashboard.")
    s = s.replace(marker, replacement, 1)
    path.write_text(s, encoding="utf-8")

print("PATCH_DASHBOARD_REFUND_FIX_FINAL_OK")
print(f"File: {path}")
print(f"Backup: {backup}")
