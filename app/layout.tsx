import type { Metadata } from "next";
import "./globals.css";
import FloatingNav from "@/components/navigation/floating-nav";
import AppShell from "@/components/navigation/app-shell";
import NavProvider from "@/components/navigation/nav-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <NavProvider>
            <FloatingNav />
            <AppShell>{children}</AppShell>
          </NavProvider>
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
