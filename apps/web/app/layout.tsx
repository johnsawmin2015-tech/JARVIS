import type { Metadata } from "next";
import type { ReactNode } from "react";
import { isDemoMode } from "@jarvis/database";
import "./globals.css";

export const metadata: Metadata = {
  title: "JARVIS",
  description: "A controlled personal intelligence platform",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body data-demo-mode={isDemoMode() ? "true" : "false"}>{children}</body>
    </html>
  );
}
