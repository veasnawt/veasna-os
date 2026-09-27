import { useEffect, useState } from "react";
import { useSupabaseSession } from "@veasnawt/auth";
import { Share } from "@capacitor/share";
import { AccountProfile } from "@veasnawt/vcut/src/ui/AccountProfile";
import { MobileSignInDialog } from "@veasnawt/vcut/src/ui/MobileSignInDialog";
import { nativeStorageUsage } from "@veasnawt/vcut/src/api/nativeStorage";
import { openNativeExternalUrl } from "@veasnawt/vcut/src/api/nativeAuth";

export function MeTab() {
  const { user } = useSupabaseSession();
  const [showSignIn, setShowSignIn] = useState(false);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  useEffect(() => {
    void nativeStorageUsage()
      .then(setUsedBytes)
      .catch(() => {});
  }, []);
  return (
    <>
      <AccountProfile
        key={user?.id ?? "signed-out"}
        onSignIn={() => setShowSignIn(true)}
        localUsageBytes={usedBytes}
        onOpenExternal={openNativeExternalUrl}
        onShare={async (url, title) => {
          await Share.share({ url, title });
        }}
      />
      {showSignIn && (
        <MobileSignInDialog onClose={() => setShowSignIn(false)} />
      )}
    </>
  );
}
