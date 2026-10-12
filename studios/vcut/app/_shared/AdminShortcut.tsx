"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sessionFetch, useSupabaseSession } from "@veasnawt/auth";
export default function AdminShortcut() {
  const { user } = useSupabaseSession();
  const [adminId, setAdminId] = useState("");
  useEffect(() => {
    let live = true;
    if (user)
      void sessionFetch("/api/vcut/admin/access")
        .then((response) => {
          if (live) setAdminId(response.ok ? user.id : "");
        })
        .catch(() => {
          if (live) setAdminId("");
        });
    return () => {
      live = false;
    };
  }, [user]);
  if (!user || adminId !== user.id) return null;
  return (
    <div className="flex shrink-0 justify-end border-b border-white/5 px-4 py-2">
      <Link
        href="/admin"
        className="rounded-lg px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-400/10"
      >
        Open admin dashboard →
      </Link>
    </div>
  );
}
