import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

import { SiteNav } from "@/components/layout/SiteNav";
import { TrpcProvider } from "@/components/providers/TrpcProvider";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "OpenCan",
  description: "Open-source customer feedback management.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="flex min-h-screen flex-col font-sans">
        <TrpcProvider>
          <SiteNav />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-gray-100 bg-white py-6">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-gray-600">
              <span>© {new Date().getFullYear()} OpenCan</span>
              <nav className="flex gap-4" aria-label="Footer">
                <Link href="/privacy" className="hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  Terms of Service
                </Link>
              </nav>
            </div>
          </footer>
        </TrpcProvider>
      </body>
    </html>
  );
}
