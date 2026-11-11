import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Power – Smart Limiter Bazar",
  description: "Monitoring dan pembatasan daya per booth tenant bazar (ESP32 + INA219)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
