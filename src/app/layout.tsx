import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CloudSync } from "@/components/CloudSync";
import { AccessibilityMenu } from "@/components/AccessibilityMenu";
import { A11Y_BOOT } from "@/lib/a11y";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Appmaker — Prompt to App Store apps",
  description:
    "Describe your app in plain English. Appmaker builds a native iOS and Android app you can preview instantly and publish to the App Store and Google Play.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the accessibility menu's settings before the page paints. */}
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOT }} />
      </head>
      {/* Browser extensions often inject attributes into <body>; don't flag those as hydration errors. */}
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <CloudSync />
        {children}
        <AccessibilityMenu />
      </body>
    </html>
  );
}
