import { ReviewWorkspace } from "@veasnawt/vcut/src/ui/ReviewWorkspace";

export default async function ProjectReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewWorkspace projectId={id} />;
}
