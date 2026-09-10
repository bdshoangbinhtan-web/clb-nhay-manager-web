from pathlib import Path
import shutil

root = Path.cwd()
target = root / "app/reports/page.tsx"
backup = root / "app/reports/page.tsx.before-finance-v2"
source = Path("/mnt/data/reports-page-v2.tsx")

if not target.exists():
    raise SystemExit(f"Không tìm thấy: {target}")
if not source.exists():
    raise SystemExit(f"Không tìm thấy patch source: {source}")

if not backup.exists():
    shutil.copy2(target, backup)

shutil.copy2(source, target)

print("PATCH_REPORTS_V2_OK")
print(f"File: {target.relative_to(root)}")
print(f"Backup: {backup.relative_to(root)}")
