"use client";
import { usePathname, useRouter } from "next/navigation";
import { useSupabaseSession } from "@veasnawt/auth";
import {
  AccountProfile,
  type OwnProfileInfo,
} from "@veasnawt/vcut/src/ui/AccountProfile";
export default function OwnProfile({
  initialProfile,
}: { initialProfile?: OwnProfileInfo } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSupabaseSession();
  return (
    <AccountProfile
      key={user?.id ?? "signed-out"}
      initialProfile={initialProfile}
      currentPath={pathname}
      onSignedOut={() => {
        if (process.env.NEXT_PUBLIC_VCUT_HOSTED === "true")
          router.replace("/login");
      }}
    />
  );
}
