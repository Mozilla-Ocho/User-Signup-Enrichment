import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
// Must run before @clerk/nextjs is imported: @clerk/nextjs/server caches
// process.env.CLERK_SECRET_KEY into a module-level constant on first import,
// so this side effect has to land first or the cached key is empty.
import "@/lib/clerk-config";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Signup Enrichment",
  description:
    "Sign up with an email and a company URL — the onboarding form shows up prefilled.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${geistMono.variable} h-full`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
