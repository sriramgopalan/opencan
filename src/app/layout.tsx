import type { Metadata } from "next";
import type { ReactNode } from "react";

import { TrpcProvider } from "@/components/providers/TrpcProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Etash",
  description: "Etash — coming soon.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  );
}
