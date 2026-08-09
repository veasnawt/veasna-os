import React from "react";

export default function PdfIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z" />
      <path d="M14 2v6h6" />
      <path d="M9 15.5v-3.5" strokeLinecap="round" />
      <path d="M9 12h1.25a1.25 1.25 0 1 1 0 2.5H9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 15.5V12h1a1.5 1.5 0 0 1 0 3.5h-1Z" />
      <path d="M16 15.5V12h1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 13.5h1.5" strokeLinecap="round" />
    </svg>
  );
}
