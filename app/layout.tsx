import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import FloatingNav from "@/components/navigation/floating-nav";
import AppShell from "@/components/navigation/app-shell";
import NavProvider from "@/components/navigation/nav-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AUTH_HASH_CAPTURE_KEY } from "@/lib/auth/early-hash-capture";

/** Runs before Next/Supabase hydrate so #access_token / type=invite survive client-side hash clearing. */
const earlyHashCaptureScript = `(function(){try{var p=location.pathname;if(p!=="/auth/signin"&&p!=="/auth/signup")return;var h=location.hash;if(!h||h[0]!=="#")return;var r=h.slice(1);if(r.indexOf("access_token=")===-1&&r.indexOf("type=")===-1)return;var u=new URLSearchParams(r);sessionStorage.setItem(${JSON.stringify(
  AUTH_HASH_CAPTURE_KEY
)},JSON.stringify({type:u.get("type"),hasImplicit:r.indexOf("access_token=")!==-1,ts:Date.now()}));}catch(e){}})();`;

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
        <Script id="auditwiz-early-hash-capture" strategy="beforeInteractive">
          {earlyHashCaptureScript}
        </Script>
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
