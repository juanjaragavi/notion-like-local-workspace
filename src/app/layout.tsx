import type { Metadata } from "next";
import { Geist, Geist_Mono, League_Spartan } from "next/font/google";
import { CacheBuster } from "@/components/CacheBuster";
import "./globals.css";

const leagueSpartan = League_Spartan({
  variable: "--font-league-spartan",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Workspace - Personal Productivity",
  description: "A customized productivity workspace for macOS",
  icons: {
    icon: "/images/3-favicon.png",
    apple: "/images/3-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${leagueSpartan.variable} ${geistSans.variable} ${geistMono.variable} font-spartan antialiased bg-neutral-950 text-white`}
      >
        <CacheBuster />
        {children}
      </body>
    </html>
  );
}
