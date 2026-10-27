import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vietnam = localFont({
  src: [
    { path: "../../assets/fonts/BeVietnamPro-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../assets/fonts/BeVietnamPro-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../assets/fonts/BeVietnamPro-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-vietnam",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Vtech – Truy xuất nguồn gốc", template: "%s · Vtech – Truy xuất nguồn gốc" },
  description: "Nền tảng truy xuất nguồn gốc xuất xứ phôi răng sứ chính hãng — Vtech Dental Supply",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1f3a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={vietnam.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
