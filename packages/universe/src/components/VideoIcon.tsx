import React from "react";

export default function VideoIcon({ size = 24 }: { size?: number }) {
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
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="m22 8-5 4 5 4Z" />
    </svg>
  );
}
