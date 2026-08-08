import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import FirewallProvider from "@/components/FirewallProvider";
import UserInboxBanner from "@/components/UserInboxBanner";
import SystemErrorSentinel from "@/components/SystemErrorSentinel";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import "./globals.css";
import "./research-panel.css";
import "./vector-creator.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Adobe Stock Metadata AI Generator – Auto Title & Keywords with Groq Vision",
  description:
    "Generate title dan keywords Adobe Stock secara otomatis dari foto menggunakan Groq AI Vision. Upload hingga 15 gambar, dapatkan metadata yang relevan, SEO-friendly, dan siap submit ke Adobe Stock Contributor portal.",
  keywords: [
    "adobe stock metadata generator",
    "adobe stock ai metadata",
    "auto generate adobe stock keywords",
    "adobe stock title generator",
    "adobe stock keyword generator",
    "groq ai vision",
    "groq vision metadata",
    "ai image metadata generator",
    "ai photo keyword generator",
    "image to keywords ai",
    "vision ai stock photo",
    "multimodal ai metadata",
    "stock photo metadata",
    "stock photo keywords",
    "stock photo title generator",
    "adobe stock seo",
    "adobe stock tags generator",
    "adobe stock discoverability",
    "stock contributor tools",
    "adobe stock contributor",
    "metadata generator online",
    "photo metadata editor",
    "auto metadata generator",
    "seo keyword generator",
    "image seo optimizer",
    "bulk metadata generator",
    "ai tagging tool",
    "ai caption generator",
    "bulk photo upload metadata",
    "batch image keyword generator",
    "upload photo get keywords",
    "15 photos metadata generator",
    "drag drop image metadata",
    "keyword research ai tool",
    "stock keyword research",
    "vector creator online",
    "vector search tool",
    "semantic search stock",
    "ai research panel",
    "next js ai app",
    "groq api metadata",
    "nextjs stock tool",
    "vercel ai deployment",
    "shutterstock keyword tool",
    "freepik metadata generator",
    "pond5 keyword generator",
    "stock media metadata ai",
    "ai powered stock keywords",
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={inter.variable}>
      <body>
        <FirewallProvider>
          <div className="app">
            {children}
            <Analytics />
            <UserInboxBanner />
            <SystemErrorSentinel />
            <MaintenanceBanner />
          </div>
        </FirewallProvider>
      </body>
    </html>
  );
}
