/** Server configuration only. Never trust editable user_metadata for admin privileges. */
export function isAdminIdentity(
  user: { id: string; email?: string | null },
  ids = "",
  emails = "",
): boolean {
  const entries = (value: string) =>
    value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  return (
    entries(ids).includes(user.id.toLowerCase()) ||
    (!!user.email && entries(emails).includes(user.email.toLowerCase()))
  );
}
export function adminPageParams(url: URL) {
  const page = Number(url.searchParams.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    throw new Error("Invalid page");
  const search = (url.searchParams.get("q") ?? "").trim();
  if (search.length > 120) throw new Error("Search is too long");
  // PostgREST .or() has its own grammar. Keep user input out of that grammar.
  const term = search
    .replace(/[^\p{L}\p{N}@ ._-]/gu, "")
    .replace(/[%_]/g, "\\$&");
  return { page, offset: (page - 1) * 25, limit: 25, search, term };
}
export const ADMIN_ACTIONS = [
  "user_suspend",
  "user_restore",
  "credits_adjust",
  "deletion_acknowledge",
  "project_restrict",
  "project_restore",
  "export_cancel",
  "feedback_status",
  "report_status",
  "template_unpublish",
  "template_restore",
  "comment_remove",
  "media_hide",
  "media_restore",
  "storage_cleanup",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];
export function parseAdminAction(input: unknown): {
  action: AdminAction;
  target: string;
  reason: string;
  value: Record<string, unknown>;
  requestId: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("A JSON action is required");
  const body = input as Record<string, unknown>;
  if (!ADMIN_ACTIONS.includes(body.action as AdminAction))
    throw new Error("Unknown action");
  if (
    typeof body.target !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(body.target)
  )
    throw new Error("Invalid target");
  if (
    typeof body.reason !== "string" ||
    body.reason.trim().length < 5 ||
    body.reason.trim().length > 1000
  )
    throw new Error("Provide a reason (5–1,000 characters)");
  if (
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.requestId,
    )
  )
    throw new Error("An action request ID is required");
  const value = body.value ?? {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid action value");
  const v = value as Record<string, unknown>;
  if (
    body.action === "credits_adjust" &&
    (!Number.isInteger(v.amount) ||
      Math.abs(Number(v.amount)) > 10000 ||
      v.amount === 0)
  )
    throw new Error(
      "Credit adjustment must be a non-zero integer between -10,000 and 10,000",
    );
  if (
    body.action === "feedback_status" &&
    !["pending", "reviewing", "resolved"].includes(String(v.status))
  )
    throw new Error("Invalid feedback status");
  if (
    body.action === "report_status" &&
    !["pending", "reviewing", "resolved", "dismissed"].includes(
      String(v.status),
    )
  )
    throw new Error("Invalid report status");
  return {
    action: body.action as AdminAction,
    target: body.target,
    reason: body.reason.trim(),
    value: v,
    requestId: body.requestId,
  };
}
