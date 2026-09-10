#!/usr/bin/env python3
from pathlib import Path
import shutil

path = Path("app/students/[id]/page.tsx")
if not path.exists():
    raise SystemExit(f"Không tìm thấy {path}")

backup = Path("app/students/[id]/page.tsx.before-security-v3")
shutil.copy2(path, backup)
text = path.read_text(encoding="utf-8")

old = '''      const { error: insertError } = await supabase
        .from("tuition_adjustments")
        .insert(rowsToInsert);

      if (insertError) {
        throw new Error(insertError.message);
      }
'''

new = '''      const {
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
'''

if old not in text:
    raise SystemExit("Không tìm thấy đoạn insert tuition_adjustments cần cập nhật.")

text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
print("PATCH_SECURITY_V3_OK")
print(f"File: {path}")
print(f"Backup: {backup}")
