import type { Metadata } from "next";
import { Overpass_Mono } from "next/font/google";
import "./globals.css";

const overpassMono = Overpass_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Vector Grid Generator",
  description: "Generate vector grid overlays for images",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${overpassMono.variable} antialiased font-mono`}>
        {children}
      </body>
    </html>
  );
}
