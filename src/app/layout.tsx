import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, UnifrakturMaguntia } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const oldEnglish = UnifrakturMaguntia({
  weight: "400",
  variable: "--font-old-english",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Accomplish AI — Weekly Accomplishment Report Generator",
  description:
    "Turn daily voice or text notes into a formatted, print-ready 2026 Weekly Accomplishment Report (.docx).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FAF9F5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${oldEnglish.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#FAF9F5] text-[#1F1E1C]">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
