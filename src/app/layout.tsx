import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PWARegister } from "@/components/pwa-register";
import { PWAUpdateBanner } from "@/components/pwa-update-banner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TCU Scheduling System | Intelligent Timetable Management",
  description: "Taguig City University academic scheduling system with AI-powered conflict detection, automatic schedule generation, and comprehensive faculty management.",
  keywords: ["TCU", "Taguig City University", "Scheduling", "Academic", "Faculty Management", "Timetable"],
  authors: [{ name: "TCU IT Department" }],
  icons: {
    icon: "/tcu-logo.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TCU Scheduling",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TCU Scheduling" />
        <meta name="apple-mobile-web-app-icon" content="/tcu-logo.png" />
        <link rel="apple-touch-icon" href="/tcu-logo.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/tcu-logo.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/tcu-logo.png" />
        <meta name="msapplication-TileImage" content="/tcu-logo.png" />
        <meta name="msapplication-TileColor" content="#0f172a" />
      </head>
      <body className={`${inter.variable} ${poppins.variable} font-sans antialiased`}>
        <PWARegister />
        <PWAUpdateBanner />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
