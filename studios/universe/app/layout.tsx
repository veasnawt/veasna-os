import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veasna OS",
  description: "Spatial 3D Operating System powered by Rixie AI Companion",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="m-0 p-0 overflow-hidden bg-[#030408] antialiased">
        {children}
      </body>
    </html>
  );
}
