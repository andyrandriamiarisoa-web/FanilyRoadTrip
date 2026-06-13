import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppModeBar } from "@/components/ui/AppModeBar";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { ThemeScript } from "@/components/ui/ThemeScript";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Odyssée — Carnet de route",
    template: "%s — Odyssée",
  },
  description: "Planificateur de voyage sur mesure pour familles avec contraintes médicales et télétravail. Tesla, bébé, travail à distance.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Odyssée",
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Odyssée",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <link rel="icon" href="/icons/icon-192.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <AppModeBar />
        <OfflineIndicator />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
