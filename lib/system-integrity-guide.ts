export type IntegrityGuide = {
  title: string;
  description: string;
  nextStep: string;
  sectionName: string;
  href: string;
};

export const INTEGRITY_GUIDES: Record<string, IntegrityGuide> = {
  CS001_DUPLICATE_CLASS_SESSION: {
    title: "Một lớp bị ghi nhận trùng buổi học",
    description: "Cùng một lớp đang có nhiều lịch học trùng ngày và giờ.",
    nextStep: "Mở lịch học của lớp, đối chiếu ngày giờ và kiểm tra bản ghi nào bị lặp trước khi điều chỉnh.",
    sectionName: "Cơ sở & Lớp",
    href: "/branches",
  },
  TW001_TAUGHT_WITHOUT_WORK_SESSION: {
    title: "Buổi đã dạy chưa được ghi nhận tính lương",
    description: "Giáo viên đã được xác nhận có dạy, nhưng hệ thống chưa tìm thấy buổi công tương ứng.",
    nextStep: "Đối chiếu điểm danh giáo viên và buổi công theo đúng lớp, ngày, giáo viên thực dạy trước khi chốt lương.",
    sectionName: "Điểm danh giáo viên",
    href: "/teacher-attendance",
  },
  TW002_WORK_SESSION_LINK_INVALID: {
    title: "Thông tin buổi dạy và buổi công chưa khớp",
    description: "Lớp, ngày dạy hoặc giáo viên thực dạy trong bản ghi lương khác với buổi học.",
    nextStep: "Kiểm tra lớp, ngày và giáo viên thực dạy ở cả điểm danh và buổi công để tìm thông tin lệch.",
    sectionName: "Lương giáo viên",
    href: "/teacher-payroll",
  },
  SUB001_SUBSTITUTE_WITHOUT_APPROVED_REQUEST: {
    title: "Buổi dạy thay chưa có đơn được duyệt",
    description: "Hệ thống có ghi nhận buổi dạy thay nhưng không tìm thấy yêu cầu dạy thay đã được phê duyệt.",
    nextStep: "Mở danh sách dạy thay, kiểm tra yêu cầu phê duyệt của đúng ngày và lớp.",
    sectionName: "Duyệt dạy thay",
    href: "/teacher-payroll/substitution",
  },
  SUB002_SUBSTITUTE_IDENTITY_MISMATCH: {
    title: "Thông tin giáo viên dạy thay không khớp",
    description: "Giáo viên hoặc lịch trong yêu cầu dạy thay khác với buổi đã ghi nhận.",
    nextStep: "Đối chiếu giáo viên chính, giáo viên dạy thay, lớp và ngày dạy trong yêu cầu đã duyệt.",
    sectionName: "Duyệt dạy thay",
    href: "/teacher-payroll/substitution",
  },
  TW003_DUPLICATE_WORK_SESSION: {
    title: "Một buổi học có nhiều bản ghi tính lương",
    description: "Cùng một buổi học đang liên kết với nhiều buổi công nên cần kiểm tra nguy cơ tính trùng.",
    nextStep: "Đối chiếu từng bản ghi buổi công với giáo viên thực dạy để tránh tính lương nhiều lần.",
    sectionName: "Lương giáo viên",
    href: "/teacher-payroll",
  },
  SAL001_EFFECTIVE_SALARY_INVALID: {
    title: "Buổi dạy chưa có mức lương hợp lệ",
    description: "Buổi dạy có thể được tính lương nhưng mức tiền đang lưu không hợp lệ hoặc bằng 0.",
    nextStep: "Kiểm tra mức lương của lớp và mức đã lưu tại ngày dạy. Không thay đổi lương lịch sử nếu chưa đối chiếu.",
    sectionName: "Lương giáo viên",
    href: "/teacher-payroll",
  },
  TUI001_TUITION_OVERPAID: {
    title: "Học phí ghi nhận thu vượt số phải thu",
    description: "Số tiền đã thu trong kỳ đang lớn hơn học phí phải thu.",
    nextStep: "Kiểm tra các phiếu thu, khoản thu trước hoặc điều chỉnh học phí để xác định phần chênh lệch.",
    sectionName: "Học phí",
    href: "/tuition",
  },
  TUI002_PAYMENT_TOTAL_MISMATCH: {
    title: "Tổng phiếu thu chưa khớp học phí",
    description: "Cộng các phiếu thu được số tiền khác với tổng đã thu ghi trên hồ sơ học phí.",
    nextStep: "Đối chiếu từng phiếu thu và ngày thu. Chỉ sửa sau khi xác định khoản nào bị thiếu hoặc ghi nhận trùng.",
    sectionName: "Học phí",
    href: "/tuition",
  },
  PAY001_PAYROLL_TOTAL_MISMATCH: {
    title: "Tổng lương cần đối chiếu với các buổi dạy",
    description: "Tổng tiền trên bảng lương khác với tiền cộng từ các buổi dạy chi tiết.",
    nextStep: "Kiểm tra phụ cấp trước, sau đó đối chiếu các buổi dạy và khoản điều chỉnh. Nếu phần chênh lệch đúng bằng phụ cấp thì chưa chắc dữ liệu bị sai.",
    sectionName: "Lương giáo viên",
    href: "/teacher-payroll",
  },
};

export function getIntegrityGuide(checkKey: string): IntegrityGuide {
  return INTEGRITY_GUIDES[checkKey] ?? {
    title: "Có dữ liệu cần kiểm tra lại",
    description: "Một số thông tin liên quan chưa khớp với kết quả kiểm tra.",
    nextStep: "Xem thông tin liên quan và đối chiếu với dữ liệu đang lưu trước khi sửa.",
    sectionName: "Trang quản lý",
    href: "/dashboard",
  };
}
