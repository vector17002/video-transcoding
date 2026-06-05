import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "S3 Upload Portal",
  description:
    "Securely upload files directly to S3 with pre-signed URLs. Fast, private, and reliable file uploads.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ backgroundColor: "#ffffff" }}>
      <body
        className={`${inter.variable} antialiased`}
        style={{ backgroundColor: "#ffffff", color: "#111111" }}
      >
        {children}
      </body>
    </html>
  );
}
