import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SquareScope",
    template: "%s · SquareScope",
  },
  description:
    "Private business intelligence dashboard for Your Business.",
  applicationName: "SquareScope",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  openGraph: {
    title: "SquareScope",
    description:
      "Sales, client, service and booking intelligence for Your Business.",
    type: "website",
    siteName: "SquareScope",
  },
  twitter: {
    card: "summary_large_image",
    title: "SquareScope",
    description:
      "Sales, client, service and booking intelligence for Your Business.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
