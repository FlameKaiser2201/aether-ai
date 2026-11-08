import type { Metadata, Viewport } from "next";

import { Providers } from "@/app/providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "AETHER — Your mind, amplified",
    template: "%s · AETHER",
  },
  description:
    "A voice-first AI workspace for study, code, interviews, research, documents and memory. Honest by design.",
  keywords: [
    "AI assistant",
    "voice assistant",
    "study assistant",
    "coding assistant",
    "interview preparation",
    "AI research",
  ],
  authors: [{ name: "AETHER" }],
  openGraph: {
    title: "AETHER — Your mind, amplified",
    description:
      "Study, code, interview, research and remember in one voice-first workspace.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
