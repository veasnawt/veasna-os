import { notFound, permanentRedirect } from "next/navigation";
import CreatorProfile from "../_shared/CreatorProfile";

/** Public /@username profiles. Other root paths still return 404. */
export default async function UsernameProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^@[a-z0-9_]{3,20}$/i.test(handle)) notFound();
  const username = handle.slice(1).toLowerCase();
  if (handle !== `@${username}`) permanentRedirect(`/@${username}`);
  return <CreatorProfile profileId={username} />;
}
