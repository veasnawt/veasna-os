import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import {
  adminIdentity,
  adminRoute,
  assertDb,
  invalidateAdminAccess,
} from "../../_lib/admin";
import { adminPageParams, parseAdminAction } from "../../_lib/adminPolicy";
import {
  expiredAdminExports,
  inspectAdminStorage,
  removeExpiredAdminExport,
} from "../../_lib/adminStorage";
import { ApiError, VCUT_ROOT } from "../../_lib/paths";
import { isDurableQueueActive } from "../../_lib/exportQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const tables = {
  projects: {
    table: "projects_index",
    fields:
      "id,owner_id,name,updated_at,vcut_admin_project_controls(restricted)",
    order: "updated_at",
    search: ["id", "name"],
  },
  exports: {
    table: "vcut_export_jobs",
    fields:
      "id,project_id,user_id,status,phase,progress,error_message,file_name,attempt_count,created_at,started_at,completed_at,heartbeat_at,cancellation_requested",
    order: "created_at",
    search: ["project_id", "file_name"],
  },
  feedback: {
    table: "user_feedback",
    fields:
      "id,user_id,category,message,status,diagnostics,created_at,reviewed_at",
    order: "created_at",
    search: ["message"],
  },
  reports: {
    table: "content_reports",
    fields:
      "id,reporter_id,target_type,target_id,target_owner_id,reason,details,status,created_at,reviewed_at",
    order: "created_at",
    search: ["target_id", "details"],
  },
  templates: {
    table: "templates",
    fields:
      "id,owner_id,name,is_public,created_at,updated_at,vcut_admin_template_controls(restricted)",
    order: "updated_at",
    search: ["id", "name"],
  },
  media: {
    table: "user_media",
    fields: "id,owner_id,name,kind,size_bytes,duration,hidden,created_at",
    order: "created_at",
    search: ["id", "name"],
  },
  subscriptions: {
    table: "subscriptions",
    fields:
      "id,user_id,provider,status,plan,product_id,current_period_end,cancel_at_period_end,environment,created_at",
    order: "created_at",
    search: ["product_id"],
  },
  credits: {
    table: "credit_transactions",
    fields: "id,user_id,provider,credits_amount,type,status,created_at",
    order: "created_at",
    search: ["type"],
  },
  audit: {
    table: "vcut_admin_audit",
    fields: "id,actor_id,action,target_id,reason,details,created_at",
    order: "created_at",
    search: ["target_id", "reason", "action"],
  },
} as const;

async function activeProjects() {
  const db = getSupabaseAdminClient();
  const ids = new Set<string>();
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await db
      .from("vcut_export_jobs")
      .select("id,project_id")
      .in("status", ["queued", "processing"])
      .order("id")
      .range(offset, offset + 499);
    assertDb(result);
    for (const row of result.data ?? []) ids.add(row.project_id);
    if ((result.data?.length ?? 0) < 500) return ids;
  }
  throw new ApiError(503, "Too many active exports to safely clean storage.");
}

export const GET = adminRoute(async (req, user) => {
  const url = new URL(req.url);
  const section = url.pathname.split("/").at(-1)!;
  if (section === "access") return { user: { id: user.id, email: user.email } };
  const db = getSupabaseAdminClient();
  if (section === "overview") {
    const days = Number(url.searchParams.get("days") ?? 30);
    if (![0, 7, 30, 90].includes(days))
      throw new ApiError(400, "Invalid date range");
    const result = await db.rpc("vcut_admin_overview", { p_days: days });
    assertDb(result);
    return {
      ...result.data,
      durableQueue: isDurableQueueActive(),
      embeddedWorker: process.env.VCUT_WORKER_EMBEDDED === "true",
      generatedAt: new Date().toISOString(),
    };
  }
  if (section === "storage") {
    const inventory = await inspectAdminStorage(VCUT_ROOT);
    const active = isDurableQueueActive() ? await activeProjects() : null;
    const expired = active ? expiredAdminExports(inventory.files, active) : [];
    const categories: Record<string, { bytes: number; files: number }> = {};
    for (const file of inventory.files) {
      const category = (categories[file.category] ??= { bytes: 0, files: 0 });
      category.bytes += file.bytes;
      category.files++;
    }
    return {
      bytes: inventory.bytes,
      fileCount: inventory.fileCount,
      disk: inventory.disk,
      incomplete: inventory.incomplete,
      unreadable: inventory.unreadable,
      categories,
      largest: inventory.files.sort((a, b) => b.bytes - a.bytes).slice(0, 25),
      cleanupEnabled: !!active,
      expiredFiles: expired.length,
      reclaimableBytes: expired.reduce((sum, f) => sum + f.bytes, 0),
      generatedAt: new Date().toISOString(),
    };
  }
  let params;
  try {
    params = adminPageParams(url);
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
  if (section === "users" || section === "deletions") {
    const result = await db.rpc("vcut_admin_users", {
      p_search: params.search,
      p_offset: params.offset,
      p_limit: params.limit,
      p_deletions: section === "deletions",
    });
    assertDb(result);
    return { ...result.data, page: params.page };
  }
  const config:
    | {
        table: string;
        fields: string;
        order: string;
        search: readonly string[];
      }
    | undefined = Object.prototype.hasOwnProperty.call(tables, section)
    ? tables[section as keyof typeof tables]
    : undefined;
  if (!config) throw new ApiError(404, "Unknown admin section");
  let query = db
    .from(config.table)
    .select(config.fields, { count: "exact" })
    .order(config.order, { ascending: false })
    .order("id")
    .range(params.offset, params.offset + params.limit - 1);
  if (params.term)
    query = query.or(
      config.search.map((field) => `${field}.ilike.%${params.term}%`).join(","),
    );
  const status = url.searchParams.get("status");
  if (
    status &&
    ["exports", "feedback", "reports", "subscriptions"].includes(section)
  ) {
    if (!/^[a-z_]{1,30}$/.test(status))
      throw new ApiError(400, "Invalid status");
    query = query.eq("status", status);
  }
  const project = url.searchParams.get("project");
  if (project) {
    if (section !== "exports" || !/^[a-zA-Z0-9_-]{1,128}$/.test(project))
      throw new ApiError(400, "Invalid project filter");
    query = query.eq("project_id", project);
  }
  const owner = url.searchParams.get("owner");
  if (owner) {
    if (!/^[a-f0-9-]{36}$/i.test(owner))
      throw new ApiError(400, "Invalid user ID");
    const field = ["projects", "media", "templates"].includes(section)
      ? "owner_id"
      : ["exports", "feedback", "subscriptions", "credits"].includes(section)
        ? "user_id"
        : null;
    if (!field)
      throw new ApiError(400, "This section cannot be filtered by owner");
    query = query.eq(field, owner);
  }
  const result = await query;
  assertDb(result);
  const rows = (result.data ?? []) as unknown as Record<string, unknown>[];
  if (section === "projects" && rows.length) {
    const outcomes = await db.rpc("vcut_admin_project_outcomes", {
      p_ids: rows.map((row) => row.id),
    });
    assertDb(outcomes);
    const byId = new Map(
      (
        outcomes.data as {
          project_id: string;
          completed: number;
          failed: number;
          active: number;
        }[]
      ).map((row) => [row.project_id, row]),
    );
    return {
      rows: rows.map((row) => ({
        ...row,
        outcomes: byId.get(String(row.id)) ?? {
          completed: 0,
          failed: 0,
          active: 0,
        },
      })),
      count: result.count ?? 0,
      page: params.page,
    };
  }
  return { rows, count: result.count ?? 0, page: params.page };
});

export const POST = adminRoute(async (req, user) => {
  if (!req.url.split("?")[0].endsWith("/actions"))
    throw new ApiError(405, "Use the admin actions endpoint");
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "JSON is required");
  if (Number(req.headers.get("content-length")) > 8192)
    throw new ApiError(413, "Action is too large");
  const text = await req.text();
  if (text.length > 8192) throw new ApiError(413, "Action is too large");
  let body;
  try {
    body = parseAdminAction(JSON.parse(text));
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
  const db = getSupabaseAdminClient();
  if (
    [
      "user_suspend",
      "user_restore",
      "credits_adjust",
      "deletion_acknowledge",
    ].includes(body.action)
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(body.target))
      throw new ApiError(400, "Invalid user ID");
    if (body.action === "user_suspend") {
      const result = await db.auth.admin.getUserById(body.target);
      if (result.error || !result.data.user)
        throw new ApiError(404, "User not found");
      if (
        adminIdentity({
          id: result.data.user.id,
          email: result.data.user.email ?? null,
        })
      )
        throw new ApiError(
          400,
          "Allowlisted administrators cannot be suspended here.",
        );
    }
  }
  if (body.action === "storage_cleanup") {
    if (body.target !== "expired_exports" || !isDurableQueueActive())
      throw new ApiError(409, "Cleanup requires the durable export queue.");
    const previous = await db
      .from("vcut_admin_audit")
      .select("actor_id,action,target_id,details")
      .eq("id", body.requestId)
      .maybeSingle();
    assertDb(previous);
    if (previous.data) {
      if (
        previous.data.actor_id !== user.id ||
        previous.data.action !== body.action ||
        previous.data.target_id !== body.target
      )
        throw new ApiError(409, "Request ID already used");
      if (previous.data.details.phase !== "completed")
        throw new ApiError(
          409,
          "This cleanup already started. Check the audit record before starting another.",
        );
      return { ok: true, details: previous.data.details, replayed: true };
    }
    const inventory = await inspectAdminStorage(VCUT_ROOT);
    const candidates = expiredAdminExports(
      inventory.files,
      await activeProjects(),
    ).slice(0, 1000);
    const audit = await db
      .from("vcut_admin_audit")
      .insert({
        id: body.requestId,
        actor_id: user.id,
        action: body.action,
        target_id: body.target,
        reason: body.reason,
        details: { phase: "started", candidates: candidates.length },
      })
      .select("id")
      .single();
    assertDb(audit);
    let removed = 0,
      bytes = 0;
    for (const file of candidates)
      if (removeExpiredAdminExport(VCUT_ROOT, file)) {
        removed++;
        bytes += file.bytes;
      }
    const details = {
      phase: "completed",
      removed,
      bytes,
      skipped: candidates.length - removed,
      incompleteScan: inventory.incomplete,
      unreadable: inventory.unreadable,
    };
    const finish = await db
      .from("vcut_admin_audit")
      .update({ details })
      .eq("id", audit.data!.id);
    assertDb(finish);
    return { ok: true, details };
  }
  const result = await db.rpc("vcut_admin_action", {
    p_actor_id: user.id,
    p_action: body.action,
    p_target: body.target,
    p_value: body.value,
    p_reason: body.reason,
    p_request_id: body.requestId,
  });
  if (result.error) {
    console.error("[vcut admin] action failed", result.error);
    if (result.error.code === "P0001" || result.error.code === "22P02")
      throw new ApiError(
        409,
        result.error.code === "P0001"
          ? result.error.message
          : "Invalid resource ID",
      );
    throw result.error;
  }
  invalidateAdminAccess(body.target);
  return result.data;
});
