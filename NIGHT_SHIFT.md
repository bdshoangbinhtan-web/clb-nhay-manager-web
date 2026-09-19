# NIGHT SHIFT - CLB NHAY MANAGER

## MỤC TIÊU
Phân tích và tối ưu phần mềm hiện tại để chạy nhanh, ổn định và dễ bảo trì hơn.

ƯU TIÊN:
1. Hiệu năng tải dữ liệu.
2. Giảm query/fetch thừa.
3. Giảm re-render.
4. Sắp xếp dữ liệu deterministic, không nhảy vị trí lung tung.
5. Tìm N+1 query.
6. Gom request độc lập bằng Promise.all khi an toàn.
7. Giảm dữ liệu lấy từ Supabase khi UI không cần.
8. Loại duplicate logic/code nếu chắc chắn an toàn.
9. Cải thiện loading/error state mà không thay đổi nghiệp vụ.

## NGUYÊN TẮC BẮT BUỘC

KHÔNG ĐƯỢC:
- deploy production
- push production
- sửa .env
- đổi Supabase project
- chạy migration
- thay database schema
- thêm/xóa column
- DROP table/trigger/function
- sửa RLS
- sửa authentication
- xóa dữ liệu
- thay đổi business logic học phí
- thay đổi logic điểm danh
- thay đổi logic tính lương
- thay đổi dữ liệu production
- rewrite module lớn chỉ để làm code đẹp
- dùng any / eslint-disable hàng loạt để che lỗi

## QUY TẮC SỬA CODE

- Giữ nguyên hành vi hiện tại nếu không có bug rõ ràng.
- Patch nhỏ nhất có thể.
- Trước khi thay đổi logic lớn, chỉ ghi đề xuất vào report, KHÔNG thực hiện.
- Không tự ý đổi API contract.
- Không tự ý đổi cấu trúc dữ liệu.
- Không làm mất chức năng đang chạy.
- Không đổi UI chỉ vì sở thích cá nhân.

## DATABASE

Database hiện đang hoạt động.
Chỉ được ĐỌC code liên quan Supabase để phân tích.

KHÔNG được chạy câu SQL làm thay đổi database.

Đặc biệt KHÔNG sửa:
- log_activity
- cleanup_tuition_when_membership_changes
- triggers
- database functions
- class_students schema

## VALIDATION

Sau mỗi nhóm thay đổi:
- kiểm tra git diff
- chạy TypeScript check nếu project có
- chạy lint nếu project có
- chạy build

Nếu thay đổi làm build lỗi:
- sửa regression do chính thay đổi đó tạo ra
- nếu không sửa an toàn được thì revert thay đổi đó

## GIT

Chỉ làm việc trên:
night-shift-optimization

Không checkout main.
Không merge.
Không push.

## KẾT THÚC CA

Tạo file NIGHT_REPORT.md gồm:

1. Tóm tắt những gì đã phân tích.
2. File nào đã sửa.
3. Mỗi file sửa gì.
4. Tại sao sửa.
5. Hiệu năng dự kiến cải thiện ở đâu.
6. Những thay đổi đã tránh vì rủi ro.
7. Kết quả lint.
8. Kết quả typecheck.
9. Kết quả build.
10. Các lỗi còn tồn tại.
11. Các đề xuất tiếp theo nhưng CHƯA thực hiện.

Cuối cùng:
- chạy git status
- chạy git diff --stat main...HEAD
- KHÔNG deploy
- KHÔNG merge
- KHÔNG push
