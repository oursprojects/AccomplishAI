import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, UnifrakturMaguntia } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex-sans",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  subsets: ["latin"],
});

const oldEnglish = UnifrakturMaguntia({
  weight: "400",
  variable: "--font-old-english",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Accomplish AI — Weekly Accomplishment Report System",
  description:
    "Turn daily voice or text notes into a formatted, print-ready 2026 Weekly Accomplishment Report (.docx).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F8F8F6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${oldEnglish.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F8F8F6] text-[#141413]">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
