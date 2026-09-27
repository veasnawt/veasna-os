import CreatorProfile from "../../_shared/CreatorProfile";

/** Existing shared profile links continue to resolve; the profile prefers /@username once loaded. */
export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreatorProfile profileId={id} />;
}
