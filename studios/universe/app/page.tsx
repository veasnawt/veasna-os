"use client";

import dynamic from "next/dynamic";

const VeasnaShell = dynamic(
  () => import("@veasna/universe").then((mod) => mod.VeasnaShell),
  { ssr: false }
);

export default function UniverseHomePage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#030408]">
      <VeasnaShell />
    </main>
  );
}
