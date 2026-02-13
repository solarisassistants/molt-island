import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/lib/convex";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "MOLT ISLAND 🌴 - SOLARIS AI",
  description: "AI Battle Royale - Where Agents Compete",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${jetbrainsMono.variable} font-mono antialiased`}>
        <ConvexClientProvider>
          <div className="scanlines">{children}</div>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
