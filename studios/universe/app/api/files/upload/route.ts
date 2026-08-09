import fs from "fs";
import path from "path";
import { isLocalRequest, localOnlyResponse } from "../../_lib/localOnlyGuard";
import { ApiError, ensureRoot, resolveSandboxed, toRelPath, errorResponse } from "../../_lib/sandboxedFs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `relName` may contain forward-slash segments (a dragged-in folder's internal structure, using the
 *  same convention as `DataTransferItem`'s `webkitGetAsEntry().fullPath`) — intermediate directories
 *  are created as needed. `resolveSandboxed` below is what actually blocks any ".." escape attempt;
 *  this just rejects the shapes that would never be a legitimate relative path in the first place. */
async function uploadFile(targetFolderRel: string, relName: string, data: ArrayBuffer) {
  if (!relName || relName.includes("\\") || relName.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
    throw new ApiError(400, "Invalid name", "invalid-name");
  }
  const relPath = targetFolderRel ? `${targetFolderRel}/${relName}` : relName;
  const abs = resolveSandboxed(relPath);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  try {
    await fs.promises.writeFile(abs, Buffer.from(data), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new ApiError(409, "Already exists", "exists");
    throw err;
  }
  return toRelPath(abs);
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  ensureRoot();
  const url = new URL(req.url);
  const targetFolderRel = url.searchParams.get("path") ?? "";
  const relName = url.searchParams.get("name") ?? "";
  try {
    const data = await req.arrayBuffer();
    return Response.json({ path: await uploadFile(targetFolderRel, relName, data) });
  } catch (err) {
    return errorResponse(err);
  }
}
