import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Yêu cầu xóa tài khoản | ABK Family Control",
  description:
    "Hướng dẫn yêu cầu xóa tài khoản và dữ liệu liên quan của ABK Family Control.",
  alternates: { canonical: "/delete-account" },
  robots: { index: true, follow: true },
};

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-rose-700">ANGEL BK</p>
            <p className="mt-1 text-lg font-black text-slate-950">ABK Family Control</p>
          </div>
          <Link
            href="/privacy"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm"
          >
            Chính sách quyền riêng tư
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-bold text-rose-700">XÓA TÀI KHOẢN VÀ DỮ LIỆU</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Yêu cầu xóa tài khoản ABK Family Control
          </h1>

          <p className="mt-5 leading-7 text-slate-700">
            Phụ huynh có thể yêu cầu xóa tài khoản ABK Family Control và dữ liệu liên quan bất kỳ lúc nào.
          </p>

          <section className="mt-8">
            <h2 className="text-xl font-black text-slate-950">Cách gửi yêu cầu</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-6 leading-7">
              <li>Gửi email đến <a className="font-bold text-rose-700 underline" href="mailto:bdshoangbinhtan@gmail.com">bdshoangbinhtan@gmail.com</a>.</li>
              <li>Tiêu đề email: <strong>Yêu cầu xóa tài khoản – ABK Family Control</strong>.</li>
              <li>Trong email, cung cấp số điện thoại đang dùng để đăng nhập và yêu cầu xóa tài khoản.</li>
              <li>ANGEL BK có thể yêu cầu xác minh quyền sở hữu tài khoản trước khi xử lý.</li>
            </ol>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-black text-slate-950">Dữ liệu sẽ được xóa</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">
              <li>Thông tin tài khoản phụ huynh gắn với số điện thoại đăng nhập.</li>
              <li>Hồ sơ trẻ do phụ huynh tạo trong ABK Family Control.</li>
              <li>Liên kết thiết bị và các quy tắc quản lý thiết bị của tài khoản.</li>
              <li>Dữ liệu vị trí và dữ liệu sử dụng liên quan đến tài khoản, nếu đã được thu thập.</li>
              <li>Các mã định danh và dữ liệu kỹ thuật liên quan không còn cần thiết để vận hành dịch vụ.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-black text-slate-950">Dữ liệu có thể được giữ lại</h2>
            <p className="mt-3 leading-7 text-slate-700">
              Một số dữ liệu tối thiểu có thể được giữ lại trong thời gian cần thiết nếu pháp luật yêu cầu,
              hoặc để phòng chống gian lận, xử lý tranh chấp và bảo vệ an toàn hệ thống. Dữ liệu được giữ lại
              sẽ không được sử dụng cho mục đích quảng cáo.
            </p>
          </section>

          <section className="mt-8 rounded-2xl bg-slate-50 p-5">
            <h2 className="text-xl font-black text-slate-950">Liên hệ</h2>
            <p className="mt-3 leading-7">
              <strong>ANGEL BK</strong><br />
              Điện thoại: <a className="font-bold text-rose-700 underline" href="tel:0933309336">0933 309 336</a><br />
              Email: <a className="font-bold text-rose-700 underline" href="mailto:bdshoangbinhtan@gmail.com">bdshoangbinhtan@gmail.com</a>
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
