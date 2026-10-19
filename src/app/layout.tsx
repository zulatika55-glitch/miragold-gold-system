import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";

// sir zul, 19/10 — "bagi untuk sir tgk kt phone sebagai apps": a manifest
// plus these two blocks is what lets a phone's "Add to Home Screen" (Chrome
// on Android, Safari on iOS) install this as a standalone, icon-on-homescreen
// app instead of just bookmarking the page. No native app, no app-store
// listing — this is the web-standard PWA install path.
export const metadata: Metadata = {
  title: "Miragold Gold Saving System",
  description: "Simpan & kumpul gram Emas 916 Miragold.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Miragold",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#78350f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 font-sans">
        <NavBar />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
