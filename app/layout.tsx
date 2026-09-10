import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: {
    default: "ANGEL BK | Mỗi bước nhảy – một bước trưởng thành.",
    template: "%s | ANGEL BK",
  },
  description: "Khám phá các lớp nhảy tại ANGEL BK và đăng ký học thử cho bé.",
  openGraph: {
    title: "ANGEL BK | Mỗi bước nhảy – một bước trưởng thành.",
    description: "Khám phá các lớp nhảy tại ANGEL BK và đăng ký học thử cho bé.",
    type: "website",
    locale: "vi_VN",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
