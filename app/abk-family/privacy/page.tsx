import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư ABK Family – Phụ huynh và Bé",
  description: "Thông tin về dữ liệu và các quyền của ABK Family Parent và ABK Family Child.",
  alternates: { canonical: "/abk-family/privacy" },
  robots: { index: true, follow: true },
};

const sections = [
  {
    title: "1. Phạm vi áp dụng",
    paragraphs: [
      "Chính sách này áp dụng cho ABK Family – Phụ huynh và ABK Family – Bé, do CLB ANGEL BK vận hành. Ứng dụng giúp phụ huynh hoặc người giám hộ liên kết và quản lý thiết bị của trẻ, thiết lập giới hạn sử dụng và cung cấp nội dung học tập.",
      "Phụ huynh hoặc người giám hộ cần tham gia quá trình ghép thiết bị và xem các thông báo cấp quyền trước khi bật những tính năng cần quyền nhạy cảm.",
    ],
  },
  {
    title: "2. Dữ liệu được xử lý",
    paragraphs: [
      "Tùy các chức năng được sử dụng, dữ liệu có thể gồm số điện thoại và thông tin xác thực của phụ huynh; tên hiển thị/hồ sơ trẻ; mã thiết bị, trạng thái ghép và kết nối; phiên bản Android, trạng thái quyền và trạng thái bảo vệ.",
      "Nếu được cho phép, ứng dụng Bé có thể gửi tên/gói ứng dụng đã cài, ứng dụng đang mở, thời gian sử dụng và số liệu phục vụ quy tắc giới hạn; vị trí thiết bị cùng thời điểm và độ chính xác; mã thông báo đẩy nếu có cấu hình. Ứng dụng cũng nhận quy tắc do phụ huynh thiết lập và thông tin bài học của CLB.",
      "Hệ thống có thể xử lý nhật ký kỹ thuật và thông tin cần thiết để vận hành, xác thực và chống lạm dụng. Dữ liệu cụ thể phụ thuộc vào quyền và phiên bản ứng dụng đang hoạt động.",
    ],
  },
  {
    title: "3. Quyền Trợ năng và quyền sử dụng ứng dụng",
    paragraphs: [
      "Trên Android, ABK Family – Bé có thể sử dụng AccessibilityService để nhận biết tên ứng dụng đang mở và thực hiện giới hạn ứng dụng do phụ huynh đặt; đây không phải dịch vụ hỗ trợ người khuyết tật. Chức năng được thiết kế không đọc nội dung tin nhắn, văn bản trên màn hình hay thao tác gõ phím.",
      "Quyền truy cập dữ liệu sử dụng hỗ trợ tính thời lượng và nhận biết các ứng dụng cần quản lý. Các quyền này cần có sự đồng ý được giải thích trên thiết bị, được cấp qua giao diện Android và có thể bị thu hồi trong Cài đặt.",
    ],
  },
  {
    title: "4. Vị trí và vị trí nền",
    paragraphs: [
      "Nếu bật tính năng định vị, vị trí thiết bị Bé có thể được gửi tới dịch vụ để phụ huynh xem vị trí gần nhất. Quyền vị trí nền là lựa chọn riêng và cho phép cập nhật khi ứng dụng không hiển thị, trong giới hạn Android cho phép.",
      "Cập nhật vị trí không liên tục hoặc tức thì được bảo đảm: mạng, pin, quyền hệ thống và giới hạn chạy nền có thể làm chậm hoặc ngừng cập nhật. Khi thu hồi quyền vị trí, chức năng phụ thuộc quyền đó sẽ không tiếp tục hoạt động.",
    ],
  },
  {
    title: "5. Mục đích và người nhận dữ liệu",
    paragraphs: [
      "Thông tin được dùng để xác thực, ghép thiết bị, gửi và thực hiện các quy tắc quản lý, hiển thị trạng thái và vị trí cho phụ huynh, cung cấp bài ôn tập, xử lý lỗi, bảo đảm an toàn hệ thống và hỗ trợ người dùng.",
      "Thông tin được truyền tới hệ thống vận hành ABK Family và các nhà cung cấp hạ tầng cần thiết để cung cấp dịch vụ; phụ huynh được liên kết có thể xem dữ liệu phù hợp của thiết bị Bé. Chúng tôi không bán dữ liệu cá nhân.",
    ],
  },
  {
    title: "6. Bảo mật và lưu giữ",
    paragraphs: [
      "Ứng dụng sử dụng kết nối HTTPS và các cơ chế kiểm soát truy cập phù hợp để hạn chế truy cập trái phép. Thời gian lưu dữ liệu có thể khác nhau theo loại dữ liệu và nhu cầu vận hành; một số thông tin cần được giữ để bảo mật hoặc tuân thủ yêu cầu pháp luật.",
      "Không có biện pháp bảo mật nào bảo đảm tuyệt đối. Nếu thiết bị ngoại tuyến hoặc người dùng thu hồi quyền hệ thống, một số chức năng giám sát và cảnh báo có thể bị gián đoạn.",
    ],
  },
  {
    title: "7. Quyền lựa chọn và yêu cầu xóa dữ liệu",
    paragraphs: [
      "Phụ huynh có thể xem lại các quyền trong Cài đặt Android, tắt tính năng tùy chọn và liên hệ ANGEL BK để yêu cầu xem, chỉnh sửa hoặc xóa tài khoản cùng dữ liệu liên quan của mình và trẻ. Vui lòng gửi email theo thông tin bên dưới, ghi tiêu đề 'Yêu cầu xóa dữ liệu ABK Family' và thông tin liên hệ để xác minh quyền yêu cầu.",
      "Sau khi xác minh, chúng tôi sẽ thông báo cách xử lý; dữ liệu có thể cần giữ lại trong phạm vi nghĩa vụ pháp luật và bảo vệ hệ thống. Việc gỡ ứng dụng khỏi điện thoại không đồng nghĩa mọi dữ liệu trên máy chủ được xóa ngay.",
    ],
  },
  {
    title: "8. Dịch vụ học tập và trẻ em",
    paragraphs: [
      "Phần Ôn bài có thể hiển thị tên lớp, nội dung âm thanh, hình ảnh hoặc video mà ANGEL BK cung cấp. Phụ huynh cần giám sát việc sử dụng và chỉ liên kết thiết bị thuộc quyền giám hộ hợp pháp của mình.",
    ],
  },
  {
    title: "9. Thay đổi chính sách",
    paragraphs: [
      "Chính sách có thể được điều chỉnh khi tính năng hoặc quy định thay đổi. Ngày cập nhật được ghi tại đầu trang. Các thay đổi quan trọng về cách dùng dữ liệu cần được thông báo phù hợp cho người sử dụng.",
    ],
  },
];

export default function AbkFamilyPrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div><p className="text-xs font-black tracking-[0.16em] text-rose-700">CLB ANGEL BK</p><p className="mt-1 text-lg font-black text-slate-950">ABK Family</p></div>
          <Link href="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">Trang chủ</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-bold text-rose-700">CHÍNH SÁCH QUYỀN RIÊNG TƯ</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">ABK Family – Phụ huynh và Bé</h1>
          <p className="mt-4 leading-7 text-slate-600">Giải thích cách ứng dụng quản lý thiết bị gia đình xử lý dữ liệu cá nhân, quyền Trợ năng, quyền sử dụng ứng dụng và vị trí thiết bị trẻ.</p>
          <p className="mt-3 text-sm text-slate-500">Cập nhật: 13/10/2026</p>
          <div className="mt-8 space-y-8 border-t border-slate-200 pt-8 text-[15px] leading-7 text-slate-700">
            {sections.map((s) => (
              <section key={s.title}>
                <h2 className="text-xl font-black text-slate-950">{s.title}</h2>
                {s.paragraphs.map((p) => <p key={p} className="mt-3">{p}</p>)}
              </section>
            ))}
            <section className="rounded-2xl bg-slate-50 p-5 sm:p-6">
              <h2 className="text-xl font-black text-slate-950">10. Liên hệ</h2>
              <p className="mt-3">Đơn vị vận hành: <strong>CLB ANGEL BK</strong></p>
              <p>Điện thoại: <a className="font-bold text-rose-700 underline" href="tel:0933309336">0933 309 336</a></p>
              <p>Email: <a className="font-bold text-rose-700 underline" href="mailto:bdshoangbinhtan@gmail.com">bdshoangbinhtan@gmail.com</a></p>
              <p>Website: <a className="font-bold text-rose-700 underline" href="https://angelbk.vn">angelbk.vn</a></p>
              <p className="mt-3 text-sm text-slate-600">Khi liên hệ về dữ liệu, vui lòng ghi rõ “ABK Family – Quyền riêng tư” hoặc “Yêu cầu xóa dữ liệu ABK Family”.</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
