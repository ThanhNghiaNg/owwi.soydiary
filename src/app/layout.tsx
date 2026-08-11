import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BabyTrack",
  description: "Theo dõi nhịp sinh hoạt của bé thật nhanh và nhẹ nhàng",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.png" },
  appleWebApp: {
    capable: true,
    title: "BabyTrack",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6d4cc4",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
