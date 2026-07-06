import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhichOutfit — Admin",
  description: "Internal reporting dashboard for WhichOutfit.",
  robots: { index: false, follow: false },
};

// Explicit viewport so the dashboard scales correctly on phones (Tyler works
// from mobile). initialScale 1 with zoom left enabled for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
