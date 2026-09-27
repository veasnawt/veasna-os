import { notFound, permanentRedirect } from "next/navigation";
import CreatorProfile from "../_shared/CreatorProfile";

/** Public /@username profiles. Other root paths still return 404. */
export default async function UsernameProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  // Next preserves reserved characters such as @ as percent escapes in dynamic params.
  let segment: string;
  try { segment = decodeURIComponent(handle); } catch { notFound(); }
  if (!/^@[a-z0-9_]{3,20}$/i.test(segment)) notFound();
  const username = segment.slice(1).toLowerCase();
  if (segment !== `@${username}`) permanentRedirect(`/@${username}`);
  return <CreatorProfile profileId={username} />;
}
