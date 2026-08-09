import { isLocalRequest, localOnlyResponse } from "../_lib/localOnlyGuard";
import { ApiError, ensureRoot, errorResponse } from "../_lib/sandboxedFs";
import {
  listEntries,
  searchEntries,
  statEntry,
  readFileContent,
  writeFileContent,
  mkdir,
  createFile,
  renameEntry,
  moveEntry,
  copyEntry,
  deleteEntries,
  restoreEntry,
} from "../_lib/fileOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  ensureRoot();
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const relPath = url.searchParams.get("path") ?? "";
  try {
    if (action === "list") return Response.json({ entries: await listEntries(relPath) });
    if (action === "readFile") return Response.json({ content: await readFileContent(relPath) });
    if (action === "search") return Response.json({ entries: await searchEntries(url.searchParams.get("q") ?? "") });
    if (action === "stat") return Response.json(await statEntry(relPath));
    throw new ApiError(400, "Unknown action");
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  ensureRoot();
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string") return errorResponse(new ApiError(400, "Bad request"));
  try {
    switch (body.action) {
      case "mkdir":
        return Response.json({ path: await mkdir(String(body.path ?? ""), String(body.name ?? "")) });
      case "createFile":
        return Response.json({ path: await createFile(String(body.path ?? ""), String(body.name ?? "")) });
      case "rename":
        return Response.json({ path: await renameEntry(String(body.path ?? ""), String(body.newName ?? "")) });
      case "move":
        return Response.json({
          path: await moveEntry(String(body.path ?? ""), String(body.targetFolderPath ?? "")),
        });
      case "copy":
        return Response.json({
          path: await copyEntry(
            String(body.path ?? ""),
            String(body.targetFolderPath ?? ""),
            body.name ? String(body.name) : undefined
          ),
        });
      case "delete":
        if (!Array.isArray(body.paths)) throw new ApiError(400, "paths must be an array");
        return Response.json(await deleteEntries(body.paths.map(String)));
      case "restore":
        return Response.json({
          path: await restoreEntry(String(body.trashPath ?? ""), String(body.originalPath ?? "")),
        });
      case "writeFile":
        await writeFileContent(String(body.path ?? ""), String(body.content ?? ""));
        return Response.json({ ok: true });
      default:
        throw new ApiError(400, "Unknown action");
    }
  } catch (err) {
    return errorResponse(err);
  }
}
