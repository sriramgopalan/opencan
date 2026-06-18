import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
      <body className="font-sans">
        <TrpcProvider>
          <SiteNav />
          {children}
        </TrpcProvider>
      </body>
    </html>
  );
}
