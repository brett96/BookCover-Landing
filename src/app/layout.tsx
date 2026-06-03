import type { Metadata } from "next";
import { Nunito, Open_Sans } from "next/font/google";
import "./globals.css";
import AnalyticsProvider from "@/components/AnalyticsProvider";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
});

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  weight: ["300", "400", "600"],
});

export const metadata: Metadata = {
  title: "BookCover | Live Demo Portal",
  description:
    "Interactive demos for BookCover member experience and agent retention portal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${openSans.variable}`}>
      <body>
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  );
}
