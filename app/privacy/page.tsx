import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư",
  description: "Chính sách quyền riêng tư của ứng dụng CLB ANGEL BK dành cho phụ huynh.",
  alternates: { canonical: "/privacy" },
};

const sections = [
  {
    title: "1. Phạm vi áp dụng",
    body: (
      <>
        <p>
          Chính sách này áp dụng cho ứng dụng <strong>CLB ANGEL BK</strong> dành cho phụ huynh
          và các dịch vụ liên quan do CLB ANGEL BK vận hành. Ứng dụng giúp phụ huynh quản lý
          thiết bị của con, theo dõi trạng thái sử dụng, áp dụng giới hạn phù hợp và truy cập
          nội dung học tập của CLB.
        </p>
      </>
    ),
  },
  {
    title: "2. Dữ liệu chúng tôi có thể xử lý",
    body: (
      <ul>
        <li>Thông tin tài khoản phụ huynh, gồm số điện thoại và thông tin xác thực cần thiết để đăng nhập.</li>
        <li>Thông tin hồ sơ của trẻ do phụ huynh hoặc CLB cung cấp, như tên hiển thị, ảnh đại diện, lớp học, giáo viên và nội dung học tập liên quan.</li>
        <li>Thông tin thiết bị, như tên/mẫu thiết bị, trạng thái trực tuyến, thời điểm kết nối gần nhất và trạng thái các tính năng bảo vệ.</li>
        <li>Dữ liệu sử dụng cần thiết cho chức năng quản lý, như thời lượng sử dụng, giới hạn thời gian, trạng thái khóa giải trí, chế độ học và các cài đặt do phụ huynh thiết lập.</li>
        <li>Vị trí của thiết bị trẻ khi tính năng vị trí được bật và được cấp quyền trên thiết bị.</li>
        <li>Mã thông báo thông báo đẩy và dữ liệu kỹ thuật cần thiết để gửi cảnh báo, đồng bộ chính sách và vận hành dịch vụ.</li>
        <li>Thông tin chẩn đoán cơ bản khi cần để phát hiện lỗi, bảo mật tài khoản và duy trì độ ổn định của hệ thống.</li>
      </ul>
    ),
  },
  {
    title: "3. Mục đích sử dụng dữ liệu",
    body: (
      <ul>
        <li>Xác thực phụ huynh và hiển thị đúng gia đình, trẻ và thiết bị được liên kết.</li>
        <li>Đồng bộ các quy tắc do phụ huynh thiết lập giữa ứng dụng phụ huynh và thiết bị trẻ.</li>
        <li>Hiển thị trạng thái thiết bị, thời lượng sử dụng và vị trí khi phụ huynh yêu cầu.</li>
        <li>Gửi thông báo về trạng thái thiết bị, bảo vệ ứng dụng, thay đổi quan trọng hoặc nội dung học tập.</li>
        <li>Cung cấp nội dung “Học cùng ABK” và thông tin lớp học liên quan.</li>
        <li>Bảo vệ tài khoản, ngăn truy cập trái phép, xử lý sự cố và cải thiện độ ổn định của dịch vụ.</li>
      </ul>
    ),
  },
  {
    title: "4. Chia sẻ dữ liệu",
    body: (
      <>
        <p>
          CLB ANGEL BK không bán dữ liệu cá nhân và không sử dụng dữ liệu của phụ huynh hoặc
          trẻ cho quảng cáo được cá nhân hóa. Dữ liệu chỉ được chia sẻ trong phạm vi cần thiết
          để vận hành dịch vụ, ví dụ với nhà cung cấp hạ tầng cơ sở dữ liệu, lưu trữ, thông báo
          đẩy, phân phối ứng dụng và các hệ thống nội bộ của CLB có liên quan trực tiếp đến tài
          khoản hoặc lớp học.
        </p>
        <p>
          Chúng tôi cũng có thể cung cấp dữ liệu khi pháp luật yêu cầu hoặc khi cần thiết để
          bảo vệ quyền, an toàn và tính toàn vẹn của người dùng và hệ thống.
        </p>
      </>
    ),
  },
  {
    title: "5. Dữ liệu vị trí và quyền trên thiết bị",
    body: (
      <>
        <p>
          Một số chức năng quản lý gia đình cần quyền hệ thống trên thiết bị trẻ, chẳng hạn vị
          trí, quyền xem thời lượng sử dụng hoặc các quyền hỗ trợ bảo vệ thiết bị. Các quyền này
          chỉ được sử dụng để cung cấp chức năng mà phụ huynh đã thiết lập. Vị trí không được
          dùng cho quảng cáo.
        </p>
      </>
    ),
  },
  {
    title: "6. Trẻ em và trách nhiệm của phụ huynh",
    body: (
      <>
        <p>
          Ứng dụng phụ huynh được thiết kế để người lớn quản lý tài khoản gia đình. Trẻ không
          tự tạo tài khoản phụ huynh. Phụ huynh hoặc người giám hộ có trách nhiệm cài đặt, cấu
          hình và sử dụng các tính năng quản lý thiết bị trẻ phù hợp với pháp luật, quyền riêng
          tư và hoàn cảnh gia đình của mình.
        </p>
      </>
    ),
  },
  {
    title: "7. Lưu trữ và xóa dữ liệu",
    body: (
      <>
        <p>
          Chúng tôi chỉ lưu dữ liệu trong thời gian cần thiết để cung cấp dịch vụ, duy trì tài
          khoản, bảo mật hệ thống hoặc đáp ứng nghĩa vụ pháp lý. Khi một thiết bị bị thu hồi liên
          kết hoặc tài khoản không còn sử dụng, một số dữ liệu kỹ thuật có thể được giữ trong
          thời gian hợp lý để xử lý sự cố và bảo mật trước khi bị xóa hoặc ẩn danh.
        </p>
        <p>
          Phụ huynh có thể yêu cầu xem, chỉnh sửa hoặc xóa dữ liệu liên quan đến tài khoản của
          mình bằng cách liên hệ theo thông tin ở cuối chính sách này. Chúng tôi có thể yêu cầu
          xác minh danh tính trước khi thực hiện yêu cầu.
        </p>
      </>
    ),
  },
  {
    title: "8. Bảo mật",
    body: (
      <>
        <p>
          Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức hợp lý để bảo vệ dữ liệu, bao gồm
          truyền dữ liệu qua kết nối được mã hóa, kiểm soát truy cập theo tài khoản và giới hạn
          quyền truy cập nội bộ theo nhu cầu vận hành.
        </p>
      </>
    ),
  },
  {
    title: "9. Thay đổi chính sách",
    body: (
      <>
        <p>
          Chính sách này có thể được cập nhật khi chức năng hoặc yêu cầu pháp lý thay đổi. Phiên
          bản mới sẽ được công bố tại chính URL này cùng ngày cập nhật.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-8 border-b border-slate-200 pb-6">
          <a href="/" className="text-sm font-semibold text-blue-700 hover:underline">
            ← CLB ANGEL BK
          </a>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Chính sách quyền riêng tư
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Ứng dụng CLB ANGEL BK dành cho phụ huynh
          </p>
          <p className="mt-1 text-sm text-slate-500">Cập nhật lần cuối: 09/10/2026</p>
        </div>

        <div className="space-y-8 text-[15px] leading-7 sm:text-base">
          <section>
            <p>
              CLB ANGEL BK tôn trọng quyền riêng tư của phụ huynh và trẻ. Chính sách này giải
              thích những dữ liệu có thể được xử lý, lý do sử dụng dữ liệu và cách phụ huynh có
              thể liên hệ với chúng tôi.
            </p>
          </section>

          {sections.map((section) => (
            <section key={section.title} className="[&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
              <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
              <div className="mt-3">{section.body}</div>
            </section>
          ))}

          <section className="rounded-2xl bg-slate-50 p-5">
            <h2 className="text-xl font-bold text-slate-950">10. Liên hệ</h2>
            <p className="mt-3">
              Nếu có câu hỏi về quyền riêng tư hoặc muốn yêu cầu xem, chỉnh sửa hay xóa dữ liệu,
              vui lòng liên hệ:
            </p>
            <p className="mt-3 font-semibold">CLB ANGEL BK</p>
            <p>
              Email:{" "}
              <a className="text-blue-700 hover:underline" href="mailto:bdshoangbinhtan@gmail.com">
                bdshoangbinhtan@gmail.com
              </a>
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
