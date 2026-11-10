import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { strings } from "@/lib/strings";

import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans-app",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: strings.appName,
  description: strings.appTagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="om" className={`${sans.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
