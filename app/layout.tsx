import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuditWiz - Clinical-Ready Research Platform",
  description: "Research auditing platform with immutable records, audit trails, and electronic signatures",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
