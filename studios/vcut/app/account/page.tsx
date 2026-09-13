"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** `/account`'s content moved to the "Me" tab (`(tabs)/me/page.tsx`) — absorbed there alongside
 *  storage usage and settings that page never had. Kept as a redirect, not deleted outright, since
 *  this URL may still be bookmarked or linked from an older build. */
export default function AccountPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/me");
  }, [router]);
  return null;
}
