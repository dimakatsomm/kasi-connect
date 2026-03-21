import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "KasiConnect Dashboard",
  description: "Manage your spaza shop or kasi eatery orders via KasiConnect",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#047857" />
      </head>
      <body className="antialiased bg-slate-50 min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
