# Angel BK Manager — Project Memory

## Product context

Angel BK Manager quản lý học viên, lớp, điểm danh, học phí, giáo viên, dạy thay, bảng lương, chi phí và báo cáo tài chính. Ngày nghiệp vụ theo Việt Nam (`Asia/Ho_Chi_Minh`).

## Stable business decisions

- Học phí: tối ưu không được làm đổi kết quả tính tiền hiện hành.
- Lương mới tính theo mức lương mỗi buổi của lớp và snapshot vào work session; dữ liệu lịch sử không được định giá lại.
- Một buổi được tính lương khi có cả work session và attendance `taught` khớp giáo viên thực dạy, lớp và ngày.
- Dạy thay phải được Admin duyệt cho đúng lớp/ngày/cặp giáo viên.
- Bảng lương đã chốt/đã chi hiển thị từ chi tiết đã lưu, không tự tính lại.
- Không thay đổi semantics chốt/khóa lương nếu chưa có xác nhận nghiệp vụ rõ ràng.

## Resolved incidents — 2026-09-17

### Substitute session missing from payroll

Nguyên nhân: luồng giáo viên xác nhận dạy thay tạo `teacher_work_sessions` nhưng thiếu `teacher_attendance(status='taught')`; payroll yêu cầu cả hai.

Khắc phục: thêm trigger đồng bộ attendance cho work session dạy thay có request approved, kèm backfill an toàn cho bản ghi thiếu. Mã tương ứng nằm trong migration `20260917160000_fix_substitute_payroll_attendance.sql` và test `substitute-payroll-sync.test.ts`.

### Test payroll was reverted

Một bảng lương dùng để test đã được hoàn tác từ `paid` về `draft`. Hai khoản chi lương tự động tạo bởi lần test đã được xóa trong cùng transaction sau khi đối chiếu số dòng và tổng tiền. Doanh thu không bị sửa; chỉ chi phí test được hoàn tác.

### Payroll-lock clarification

Đã từng thử guard database chặn mọi ghi attendance/work session sau khi chốt. Thay đổi này được gỡ ngay sau khi làm rõ yêu cầu. Trạng thái production hiện giữ semantics cũ; không tái tạo guard đó nếu chưa được người dùng xác nhận rõ.

## Operational notes

- Supabase CLI từng không link được project do quyền tài khoản; thay đổi production đã được thực hiện qua SQL Editor sau khi kiểm tra trực tiếp schema.
- Production có thể chưa đồng bộ toàn bộ lịch sử migration trong repo. Không giả định function hoặc migration đã tồn tại chỉ vì file có trong source.
- File `app/tuition/page.tsx` có thay đổi của người dùng; giữ nguyên khi làm nhiệm vụ không liên quan.
