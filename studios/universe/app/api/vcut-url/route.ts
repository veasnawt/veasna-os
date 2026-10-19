import { resolveVCutIntegration } from "@veasnawt/integrations";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(resolveVCutIntegration(process.env.VCUT_URL), {
    headers: { "Cache-Control": "no-store" },
  });
}
