import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./browser.ts";

export interface SessionState {
  /** `undefined` while the initial session check is still in flight — deliberately distinct from
   *  `null` (checked, genuinely signed out) so a caller can show nothing/a loading state instead of
   *  briefly flashing "signed out" UI before the real answer arrives. */
  user: { id: string; email: string | null } | null | undefined;
  signOut: () => Promise<void>;
}

/** The one hook every hosted-mode page needs to know "is someone signed in, and who" — studios/vcut's
 *  own login/landing/projects pages, and `packages/vcut/src/ui/VCutApp.tsx`'s sign-out button, all
 *  read from this instead of each re-deriving it. Lives in this SHARED package (not studios/vcut's
 *  own app code) specifically so `VCutApp.tsx` — the editor UI shared by web, desktop, AND the
 *  fully-offline native mobile shell — can use it too; a studios/vcut-local file couldn't be imported
 *  from there without an inverted, consumer-into-shared-package dependency. Outside a hosted build
 *  (desktop, local dev, native mobile — everywhere `getSupabaseBrowserClient` returns `null`, see its
 *  own doc comment), `user` settles at `null` immediately and never changes; nothing here ever runs a
 *  Supabase call in that case. Callers needing "use client" (every one so far) already have it on
 *  their own component — this hook itself needs no directive of its own to be used from one. */
export function useSupabaseSession(): SessionState {
  const [user, setUser] = useState<SessionState["user"]>(undefined);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setUser(null);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user;
      setUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email ?? null } : null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
  }

  return { user, signOut };
}
