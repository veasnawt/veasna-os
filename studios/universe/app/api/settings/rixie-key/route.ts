import { NextRequest, NextResponse } from "next/server";
import { isLocalRequest, localOnlyResponse } from "../../_lib/localOnlyGuard";
import { getApiKeyStatus, setApiKey, setActiveProvider, RixieProvider } from "../../_lib/rixieEnvFile";

export const runtime = "nodejs";

const VALID_PROVIDERS: RixieProvider[] = ["anthropic", "openai", "gemini"];

/** The web-mode counterpart to apps/desktop's "settings:get-api-key-status"/"settings:set-api-key"/
 *  "settings:set-active-provider" IPC handlers — SettingsPanel.tsx's Rixie AI section uses the
 *  Electron bridge when it's available (the packaged app) and falls back to these routes when it
 *  isn't (a plain browser tab), so the same UI works in both. Guarded the same way Terminal/Files
 *  are: this writes a real file on whatever machine is running the server, so it's refused for
 *  anything that doesn't look local. */

// GET /api/settings/rixie-key — { activeProvider, configured: {anthropic, openai, gemini} },
// never any key value itself.
export async function GET(req: NextRequest) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  try {
    return NextResponse.json(getApiKeyStatus());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function badProvider(provider: unknown) {
  return !provider || !VALID_PROVIDERS.includes(provider as RixieProvider);
}

// POST /api/settings/rixie-key — { provider, apiKey } -> saves a key AND makes it active, takes
// effect on the next chat message with no restart (route.ts's loadRixieEnv() re-reads the file on
// every request).
export async function POST(req: NextRequest) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  try {
    const { provider, apiKey } = (await req.json()) as { provider?: string; apiKey?: string };
    if (badProvider(provider)) {
      return NextResponse.json({ error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` }, { status: 400 });
    }
    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json({ error: "Missing 'apiKey'" }, { status: 400 });
    }
    setApiKey(provider as RixieProvider, apiKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/settings/rixie-key — { provider } -> switches the active provider WITHOUT touching
// any saved key, for reusing a key that was already saved for it earlier.
export async function PATCH(req: NextRequest) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  try {
    const { provider } = (await req.json()) as { provider?: string };
    if (badProvider(provider)) {
      return NextResponse.json({ error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` }, { status: 400 });
    }
    setActiveProvider(provider as RixieProvider);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
