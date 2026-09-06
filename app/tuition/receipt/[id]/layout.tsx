export default function ReceiptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A5 portrait;
            margin: 0;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            width: 148mm !important;
            min-height: 210mm !important;
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
            left: 0 !important;
            top: 0 !important;
            width: 148mm !important;
            min-height: 210mm !important;
            max-height: 210mm !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            box-sizing: border-box !important;
            background: white !important;
          }

          .receipt-page button {
            display: none !important;
          }

          .receipt-page img {
            max-height: 22mm !important;
          }

          .receipt-page h1 {
            font-size: 20pt !important;
            margin: 2mm 0 !important;
          }

          .receipt-page h2 {
            font-size: 13pt !important;
            margin: 1mm 0 !important;
          }

          .receipt-page p,
          .receipt-page div,
          .receipt-page span,
          .receipt-page b {
            line-height: 1.25 !important;
          }

          .receipt-page .signature-area {
            margin-top: 8mm !important;
          }
        }
      `}</style>

      <div className="receipt-page">{children}</div>
    </>
  );
}
