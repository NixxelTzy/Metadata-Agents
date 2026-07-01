import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./research-panel.css";




const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Adobe Stock Metadata Generator with Groq AI",
  description:
    "Generate metadata Adobe Stock yang relevan menggunakan Groq AI: riset keyword, membuat judul, dan membangun vector untuk hasil yang mudah ditemukan.",
  // NOTE: metadata.keywords digunakan untuk SEO.
  keywords: [
    "adobe stock",
    "adobe stock metadata",
    "adobe stock keyword",
    "adobe stock title",
    "adobe stock description",
    "adobe stock tags",
    "stock ai",
    "stock ai studio",
    "metadata generator",
    "metadata generator ai",
    "ai keyword generator",
    "keyword research",
    "keyword research ai",
    "groq ai",
    "groq metadata generator",
    "groq keyword",
    "groq ai text",
    "generative ai for stock",
    "ai for stock photos",
    "stock photo metadata",
    "photo metadata generator",
    "image to keywords",
    "image metadata",
    "vector creator",
    "vector creation",
    "vector search",
    "vector embeddings",
    "semantic vector",
    "research panel",
    "research engine",
    "adobe stock research",
    "adobe stock listing",
    "discoverability",
    "seo keywords",
    "content optimization",
    "on-page seo",
    "search friendly keywords",
    "high relevance keywords",
    "tag optimization",
    "title optimization",
    "description optimization",
    "image uploader",
    "ai caption",
    "ai tagging",
    "stock media",
    "media metadata",
    "groq powered",
    "ai powered metadata",
    "adobe stock generator",
    "adobe stock keywords",
    "adobe stock seo",
    "stock vector search",
    "vector metadata generator",
    "adobe stock vector tags",
    "adobe stock listing generator"
  ],
};


export const viewport: Viewport = {
  width: 'device-width',
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
        <div className="app">
          {children}
          <Analytics />
        </div>
      </body>
    </html>
  );
}
