import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư | ABK Family Control",
  description:
    "Chính sách quyền riêng tư của ứng dụng ABK Family Control do ANGEL BK vận hành.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const updatedAt = "09/10/2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-rose-700">ANGEL BK</p>
            <p className="mt-1 text-lg font-black text-slate-950">ABK Family Control</p>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Trang chủ
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="border-b border-slate-200 pb-7">
            <p className="text-sm font-bold text-rose-700">CHÍNH SÁCH QUYỀN RIÊNG TƯ</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              ABK Family Control
            </h1>
            <p className="mt-4 leading-7 text-slate-600">
              Chính sách này giải thích cách ABK Family Control thu thập, sử dụng,
              lưu trữ và bảo vệ thông tin khi phụ huynh sử dụng ứng dụng để quản lý
              thiết bị của con và truy cập nội dung học tập do ANGEL BK cung cấp.
            </p>
            <p className="mt-3 text-sm text-slate-500">Cập nhật lần cuối: {updatedAt}</p>
          </div>

          <div className="space-y-8 pt-8 text-[15px] leading-7 text-slate-700">
            <section>
              <h2 className="text-xl font-black text-slate-950">1. Thông tin chúng tôi có thể thu thập</h2>
              <p className="mt-3">
                Tùy theo tính năng phụ huynh sử dụng và quyền được cấp trên thiết bị,
                ứng dụng có thể xử lý các nhóm thông tin sau:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Số điện thoại phụ huynh và thông tin cần thiết để xác thực bằng OTP.</li>
                <li>Thông tin hồ sơ trẻ do phụ huynh tạo, ví dụ tên hiển thị hoặc biệt danh.</li>
                <li>Thông tin thiết bị như nền tảng, trạng thái kết nối và mã định danh kỹ thuật cần thiết để liên kết thiết bị với tài khoản phụ huynh.</li>
                <li>Thông tin về ứng dụng trên thiết bị, quy tắc cho phép/chặn và dữ liệu sử dụng cần thiết cho các chức năng quản lý thiết bị.</li>
                <li>Vị trí thiết bị khi phụ huynh bật tính năng định vị và cấp quyền vị trí phù hợp.</li>
                <li>Thông tin kỹ thuật, nhật ký lỗi và dữ liệu vận hành cần thiết để duy trì độ ổn định và bảo mật của dịch vụ.</li>
                <li>Nội dung lớp học, nhạc hoặc video do ANGEL BK cung cấp khi phụ huynh sử dụng tính năng Ôn bài.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-950">2. Mục đích sử dụng dữ liệu</h2>
              <p className="mt-3">Dữ liệu được sử dụng để:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Đăng nhập, xác thực và bảo vệ tài khoản phụ huynh.</li>
                <li>Liên kết và quản lý thiết bị trẻ theo yêu cầu của phụ huynh hoặc người giám hộ.</li>
                <li>Thực hiện các tính năng kiểm soát ứng dụng, trạng thái thiết bị và định vị khi được bật.</li>
                <li>Cung cấp nội dung học tập, nhạc và video liên quan đến lớp học.</li>
                <li>Phát hiện lỗi, ngăn chặn lạm dụng và cải thiện độ an toàn, ổn định của ứng dụng.</li>
                <li>Hỗ trợ người dùng khi có yêu cầu.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-950">3. Dữ liệu của trẻ em</h2>
              <p className="mt-3">
                ABK Family Control được thiết kế để phụ huynh hoặc người giám hộ quản lý
                thiết bị của trẻ. Việc thiết lập, liên kết thiết bị và cấp các quyền nhạy cảm
                phải do phụ huynh hoặc người giám hộ thực hiện. Chúng tôi chỉ xử lý dữ liệu
                của trẻ trong phạm vi cần thiết để cung cấp các tính năng mà phụ huynh đã bật.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-950">4. Quyền vị trí và quyền thiết bị</h2>
              <p className="mt-3">
                Một số chức năng có thể cần quyền hệ thống như vị trí hoặc quyền hỗ trợ quản lý
                thiết bị. Ứng dụng chỉ sử dụng các quyền này cho chức năng mà phụ huynh đã chọn.
                Phụ huynh có thể thay đổi hoặc thu hồi quyền trong cài đặt thiết bị; khi đó một
                số chức năng tương ứng có thể không hoạt động.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-950">5. Chia sẻ dữ liệu</h2>
              <p className="mt-3">
                Chúng tôi không bán dữ liệu cá nhân. Dữ liệu có thể được xử lý bởi các nhà cung
                cấp hạ tầng, xác thực, lưu trữ hoặc dịch vụ kỹ thuật cần thiết để vận hành ứng
                dụng, theo các biện pháp bảo vệ phù hợp. Dữ liệu cũng có thể được cung cấp khi
                pháp luật yêu cầu hợp lệ.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-950">6. Lưu trữ và bảo mật</h2>
              <p className="mt-3">
                Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức hợp lý để hạn chế truy cập
                trái phép, mất mát hoặc lạm dụng dữ liệu. Dữ liệu chỉ được lưu trong thời gian
                cần thiết cho mục đích cung cấp dịch vụ, đáp ứng nghĩa vụ pháp lý hoặc giải quyết
                yêu cầu hỗ trợ và tranh chấp.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-950">7. Xóa tài khoản và dữ liệu</h2>
              <p className="mt-3">
                Phụ huynh có thể yêu cầu xóa tài khoản và dữ liệu liên quan bằng cách liên hệ
                ANGEL BK qua thông tin ở cuối trang. Sau khi xác minh yêu cầu, chúng tôi sẽ xử lý
                việc xóa trong phạm vi pháp luật cho phép. Một số dữ liệu tối thiểu có thể được
                giữ lại nếu cần để đáp ứng nghĩa vụ pháp lý, chống gian lận hoặc bảo vệ an toàn
                của hệ thống.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-950">8. Quyền của phụ huynh</h2>
              <p className="mt-3">
                Phụ huynh có thể yêu cầu được biết, chỉnh sửa hoặc xóa thông tin cá nhân do mình
                cung cấp, cũng như ngừng sử dụng các tính năng tùy chọn bằng cách tắt quyền tương
                ứng hoặc ngắt liên kết thiết bị.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-950">9. Thay đổi chính sách</h2>
              <p className="mt-3">
                Chính sách này có thể được cập nhật khi ứng dụng thay đổi tính năng, hạ tầng hoặc
                yêu cầu pháp lý. Phiên bản mới sẽ được đăng tại địa chỉ này và ghi rõ ngày cập nhật.
              </p>
            </section>

            <section className="rounded-2xl bg-slate-50 p-5 sm:p-6">
              <h2 className="text-xl font-black text-slate-950">10. Liên hệ</h2>
              <p className="mt-3">
                <strong>ANGEL BK</strong><br />
                Điện thoại: <a className="font-bold text-rose-700 underline underline-offset-2" href="tel:0933309336">0933 309 336</a><br />
                Email: <a className="font-bold text-rose-700 underline underline-offset-2" href="mailto:bdshoangbinhtan@gmail.com">bdshoangbinhtan@gmail.com</a><br />
                Website: <a className="font-bold text-rose-700 underline underline-offset-2" href="https://angelbk.vn">angelbk.vn</a>
              </p>
              <p className="mt-3 text-sm text-slate-500">
                Vui lòng ghi rõ “Yêu cầu quyền riêng tư – ABK Family Control” khi liên hệ về dữ liệu cá nhân.
              </p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
