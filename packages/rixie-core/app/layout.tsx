import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rixie Core Console",
  description: "Provider-Agnostic Agent Console for Rixie",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-[#0A0C12] text-[#E7E6EF]">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="h-full m-0 p-0">{children}</body>
    </html>
  );
}
