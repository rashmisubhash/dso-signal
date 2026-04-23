import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSO Signal",
  description: "A cashflow wedge for AR teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
