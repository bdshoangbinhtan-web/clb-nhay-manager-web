/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

export default function ReceiptPage() {
  const { id } = useParams();
  const supabase = createClient();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: payment, error } = await supabase
        .from("tuition_payments")
        .select("id,tuition_id,amount,payment_method,payment_date,receipt_no")
        .eq("id", String(id))
        .single();

      if (error || !payment) {
        alert(error?.message || "Không tìm thấy phiếu thu.");
        setLoading(false);
        return;
      }

      const { data: tuition, error: tuitionError } = await supabase
        .from("tuition")
        .select("id,student_id,class_id,branch_id,billing_month,amount_due,amount_paid")
        .eq("id", payment.tuition_id)
        .single();

      if (tuitionError || !tuition) {
        alert(tuitionError?.message || "Không tìm thấy học phí.");
        setLoading(false);
        return;
      }

      const [{ data: student }, { data: cls }, { data: branch }] =
        await Promise.all([
          supabase.from("students").select("full_name").eq("id", tuition.student_id).single(),
          supabase.from("classes").select("name").eq("id", tuition.class_id).single(),
          tuition.branch_id
            ? supabase.from("branches").select("name,address").eq("id", tuition.branch_id).single()
            : Promise.resolve({ data: null }),
        ]);

      const { data: payments } = await supabase
        .from("tuition_payments")
        .select("amount")
        .eq("tuition_id", tuition.id);

      const totalPaid = (payments || []).reduce(
        (sum, x) => sum + Number(x.amount),
        0
      );

      setData({
        receiptNo: payment.receipt_no || payment.id,
        student: student?.full_name || "—",
        className: cls?.name || "—",
        branch: branch?.name || "Chưa gán cơ sở",
        address: branch?.address || "—",
        month: tuition.billing_month
          ? tuition.billing_month.slice(5, 7) + "/" + tuition.billing_month.slice(0, 4)
          : "—",
        due: Number(tuition.amount_due || 0),
        current: Number(payment.amount || 0),
        paid: totalPaid,
        remaining: Math.max(Number(tuition.amount_due || 0) - totalPaid, 0),
        method:
          payment.payment_method === "transfer"
            ? "Chuyển khoản"
            : payment.payment_method === "cash"
            ? "Tiền mặt"
            : "Chưa phân loại",
        date: payment.payment_date
          ? new Date(payment.payment_date + "T00:00:00").toLocaleDateString("vi-VN")
          : "—",
      });

      setLoading(false);
    }

    load();
  }, [id]);

  if (loading) {
    return <div className="p-10 text-center">Đang tải phiếu thu...</div>;
  }

  if (!data) return null;

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: 80mm 175mm;
            margin: 0;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            width: 80mm !important;
            height: auto !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .receipt-page,
          .receipt-page * {
            visibility: visible !important;
          }

          .receipt-page {
            position: absolute !important;
            inset: 0 !important;
            width: 80mm !important;
            height: auto !important;
            max-height: auto !important;
            overflow: hidden !important;
            padding: 4mm !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .receipt-card {
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: white !important;
          }

          .receipt-header {
            display: flex !important;
            align-items: center !important;
            text-align: left !important;
            gap: 5mm !important;
            padding-bottom: 3mm !important;
          }

          .receipt-header img {
            flex: 0 0 auto !important;
            width: 17mm !important;
            height: 17mm !important;
            margin: 0 !important;
          }

          .receipt-header h1 {
            font-size: 17pt !important;
            line-height: 1.05 !important;
            margin: 0 0 1mm 0 !important;
          }

          .receipt-header .receipt-title {
            font-size: 11pt !important;
            line-height: 1.1 !important;
          }

          .receipt-header .receipt-number {
            margin-top: 2mm !important;
            font-size: 8pt !important;
          }

          .receipt-info {
            margin-top: 3mm !important;
            gap: 2mm 5mm !important;
          }

          .receipt-info .address-row {
            grid-column: auto !important;
          }

          .receipt-info .address-row > div:last-child {
            margin-top: 0.5mm !important;
            font-size: 7.8pt !important;
            line-height: 1.1 !important;
          }

          .receipt-info > div > div:last-child {
            margin-top: 0.5mm !important;
            font-size: 8.5pt !important;
            line-height: 1.15 !important;
          }

          .receipt-money {
            margin-top: 3mm !important;
            border-radius: 3mm !important;
          }

          .receipt-money > div {
            padding: 2mm 2.5mm !important;
            font-size: 8.5pt !important;
          }

          .receipt-money > div b.text-lg {
            font-size: 11pt !important;
          }

          .receipt-method {
            margin-top: 2mm !important;
            gap: 5mm !important;
          }

          .receipt-method > div > div:last-child {
            margin-top: 0.5mm !important;
            font-size: 8.5pt !important;
          }

          .receipt-footer {
            margin-top: 4mm !important;
            gap: 5mm !important;
          }

          .receipt-footer > div > div {
            margin-top: 9mm !important;
            font-size: 8pt !important;
          }

          .receipt-note {
            margin-top: 5mm !important;
            font-size: 8pt !important;
          }
        }
      `}</style>

      <div className="receipt-page min-h-screen bg-slate-100 p-6">
        <div className="no-print mx-auto mb-5 flex max-w-[700px] justify-between">
          <button
            onClick={() => window.close()}
            className="rounded-xl bg-white px-5 py-3 font-bold shadow"
          >
            ← Đóng
          </button>

          <button
            onClick={() => window.print()}
            className="rounded-xl bg-slate-900 px-6 py-3 font-bold text-white shadow"
          >
            🖨️ In phiếu thu
          </button>
        </div>

        <main className="receipt-card mx-auto max-w-[700px] rounded-2xl bg-white p-10 shadow-xl">
          <header className="receipt-header border-b-2 border-slate-900 pb-5 text-center">
            <img
              src="/angelbk-logo.jpg"
              alt="ANGEL BK Dance Club"
              className="mx-auto mb-4 h-24 w-24 rounded-full object-cover"
            />
            <div>
              <h1 className="text-3xl font-black">ANGEL BK</h1>
              <div className="receipt-title mt-1 font-bold">PHIẾU THU HỌC PHÍ</div>
              <div className="mt-1 text-xs font-semibold">ĐT: 0933309336</div>
              <div className="receipt-number mt-3 text-sm">
                Số phiếu: <b>{data.receiptNo}</b>
              </div>
            </div>
          </header>

          <section className="receipt-info mt-7 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-bold text-slate-400">HỌC VIÊN</div>
              <div className="mt-1 font-black">{data.student}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-400">LỚP</div>
              <div className="mt-1 font-black">{data.className}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-400">CƠ SỞ</div>
              <div className="mt-1 font-bold">{data.branch}</div>
            </div>

            <div className="address-row col-span-2">
              <div className="text-xs font-bold text-slate-400">ĐỊA CHỈ</div>
              <div className="mt-1 font-semibold">{data.address}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-400">KỲ HỌC PHÍ</div>
              <div className="mt-1 font-bold">{data.month}</div>
            </div>
          </section>

          <section className="receipt-money mt-7 overflow-hidden rounded-xl border">
            <div className="flex justify-between border-b p-4">
              <span>Số tiền phải thu</span>
              <b>{money(data.due)}</b>
            </div>

            <div className="flex justify-between border-b bg-emerald-50 p-4 text-emerald-700">
              <b>Lần thu này</b>
              <b className="text-lg">{money(data.current)}</b>
            </div>

            <div className="flex justify-between border-b p-4">
              <span>Tổng đã thu</span>
              <b>{money(data.paid)}</b>
            </div>

            <div className="flex justify-between p-4">
              <span>Còn lại</span>
              <b className={data.remaining ? "text-rose-600" : "text-emerald-600"}>
                {money(data.remaining)}
              </b>
            </div>
          </section>

          <section className="receipt-method mt-6 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-bold text-slate-400">HÌNH THỨC</div>
              <div className="mt-1 font-bold">{data.method}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-400">NGÀY THU</div>
              <div className="mt-1 font-bold">{data.date}</div>
            </div>
          </section>

          <footer className="receipt-footer mt-14 grid grid-cols-2 gap-10 text-center">
            <div>
              <b>Người nộp tiền</b>
              <div className="mt-16 text-sm text-slate-400">
                Ký và ghi rõ họ tên
              </div>
            </div>

            <div>
              <b>Người thu tiền</b>
              <div className="mt-16 text-sm text-slate-400">
                Ký và ghi rõ họ tên
              </div>
            </div>
          </footer>

          <div className="receipt-note mt-8 text-center text-xs text-slate-400">
            Cảm ơn quý phụ huynh và học viên đã đồng hành cùng CLB.
          </div>
        </main>
      </div>
    </>
  );
}
