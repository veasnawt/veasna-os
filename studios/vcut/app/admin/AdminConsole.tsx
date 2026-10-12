"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sessionFetch, useSupabaseSession } from "@veasnawt/auth";
import type { AdminAction } from "../api/vcut/_lib/adminPolicy";

type Row = Record<string, unknown>;
type Section =
  | "overview"
  | "users"
  | "projects"
  | "exports"
  | "feedback"
  | "reports"
  | "deletions"
  | "templates"
  | "media"
  | "storage"
  | "subscriptions"
  | "credits"
  | "audit";
interface Overview {
  users: number;
  projects: number;
  libraryBytes: number;
  pendingFeedback: number;
  pendingReports: number;
  pendingDeletions: number;
  subscriptions: number;
  exports: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    successfulProjects: number;
    failedProjects: number;
    averageSeconds: number | null;
  };
  queue: { queued: number; processing: number; stalled: number };
  daily: { day: string; completed: number; failed: number }[];
  durableQueue: boolean;
  embeddedWorker: boolean;
  generatedAt: string;
}
interface Storage {
  bytes: number;
  fileCount: number;
  disk: { totalBytes: number; availableBytes: number } | null;
  incomplete: boolean;
  unreadable: number;
  categories: Record<string, { bytes: number; files: number }>;
  largest: {
    relativePath: string;
    bytes: number;
    modifiedMs: number;
    category: string;
  }[];
  cleanupEnabled: boolean;
  expiredFiles: number;
  reclaimableBytes: number;
  generatedAt: string;
}
interface Action {
  type: AdminAction;
  target: string;
  label: string;
  name: string;
  value?: Row;
  danger?: boolean;
}
const sections: { id: Section; label: string; group: string }[] = [
  { id: "overview", label: "Overview", group: "Operations" },
  { id: "exports", label: "Exports & failures", group: "Operations" },
  { id: "users", label: "Users", group: "Accounts" },
  { id: "projects", label: "Projects", group: "Accounts" },
  { id: "subscriptions", label: "Subscriptions", group: "Accounts" },
  { id: "credits", label: "Credit ledger", group: "Accounts" },
  { id: "feedback", label: "Feedback", group: "Support & safety" },
  { id: "reports", label: "Content reports", group: "Support & safety" },
  { id: "deletions", label: "Deletion requests", group: "Support & safety" },
  { id: "templates", label: "Templates", group: "Support & safety" },
  { id: "media", label: "Media library", group: "Infrastructure" },
  { id: "storage", label: "Storage", group: "Infrastructure" },
  { id: "audit", label: "Audit trail", group: "Infrastructure" },
];
const columns: Partial<Record<Section, { key: string; label: string }[]>> = {
  users: [
    { key: "email", label: "Account" },
    { key: "plan", label: "Plan / credits" },
    { key: "project_count", label: "Projects" },
    { key: "media_bytes", label: "Library" },
    { key: "last_sign_in_at", label: "Last sign-in" },
  ],
  projects: [
    { key: "name", label: "Project" },
    { key: "owner_id", label: "Owner" },
    { key: "outcomes", label: "Hosted renders" },
    { key: "restricted", label: "Access" },
    { key: "updated_at", label: "Updated" },
  ],
  exports: [
    { key: "file_name", label: "Export / project" },
    { key: "status", label: "Status" },
    { key: "progress", label: "Progress" },
    { key: "attempt_count", label: "Attempts" },
    { key: "created_at", label: "Created" },
  ],
  feedback: [
    { key: "message", label: "Message" },
    { key: "category", label: "Category" },
    { key: "status", label: "Status" },
    { key: "user_id", label: "User" },
    { key: "created_at", label: "Received" },
  ],
  reports: [
    { key: "target_id", label: "Reported content" },
    { key: "reason", label: "Reason" },
    { key: "status", label: "Status" },
    { key: "target_owner_id", label: "Owner" },
    { key: "created_at", label: "Received" },
  ],
  deletions: [
    { key: "email", label: "Account" },
    { key: "deletion_reason", label: "Reason" },
    { key: "deletion_requested_at", label: "Requested" },
    { key: "deletion_reviewed_at", label: "Acknowledged" },
  ],
  templates: [
    { key: "name", label: "Template" },
    { key: "owner_id", label: "Owner" },
    { key: "is_public", label: "Visibility" },
    { key: "updated_at", label: "Updated" },
  ],
  media: [
    { key: "name", label: "Media" },
    { key: "owner_id", label: "Owner" },
    { key: "kind", label: "Type" },
    { key: "size_bytes", label: "Size" },
    { key: "hidden", label: "Library visibility" },
  ],
  subscriptions: [
    { key: "user_id", label: "User" },
    { key: "provider", label: "Provider" },
    { key: "status", label: "Status" },
    { key: "current_period_end", label: "Period ends" },
    { key: "environment", label: "Environment" },
  ],
  credits: [
    { key: "user_id", label: "User" },
    { key: "credits_amount", label: "Credits" },
    { key: "type", label: "Type" },
    { key: "provider", label: "Provider" },
    { key: "created_at", label: "Created" },
  ],
  audit: [
    { key: "action", label: "Action" },
    { key: "target_id", label: "Target" },
    { key: "actor_id", label: "Administrator" },
    { key: "reason", label: "Reason" },
    { key: "created_at", label: "Date" },
  ],
};
const statuses: Partial<Record<Section, string[]>> = {
  exports: ["queued", "processing", "completed", "failed", "cancelled"],
  feedback: ["pending", "reviewing", "resolved"],
  reports: ["pending", "reviewing", "resolved", "dismissed"],
  subscriptions: [
    "active",
    "trialing",
    "canceled",
    "expired",
    "in_grace_period",
    "on_hold",
    "paused",
  ],
};
const control =
  "rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40";
const button = `${control} cursor-pointer transition hover:border-white/30 hover:bg-white/10 min-h-10 disabled:cursor-not-allowed`;
const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
const number = (value: unknown) => Number(value ?? 0).toLocaleString();
function bytes(value: number) {
  if (!value) return "0 B";
  const i = Math.min(
    4,
    Math.floor(Math.log(Math.max(1, value)) / Math.log(1024)),
  );
  return `${(value / 1024 ** i).toFixed(i ? 1 : 0)} ${["B", "KB", "MB", "GB", "TB"][i]}`;
}
function date(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "Invalid date" : d.toLocaleString();
}
function restricted(row: Row) {
  const v = row.vcut_admin_project_controls;
  return !!(Array.isArray(v)
    ? v[0]?.restricted
    : (v as Row | null)?.restricted);
}
function Badge({ children }: { children: ReactNode }) {
  const good = [
    "completed",
    "resolved",
    "active",
    "trialing",
    "Public",
    "Available",
  ].includes(String(children));
  const bad = ["failed", "Suspended", "Restricted"].includes(String(children));
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${good ? "bg-emerald-400/10 text-emerald-300" : bad ? "bg-rose-400/10 text-rose-300" : "bg-slate-400/10 text-slate-300"}`}
    >
      {children}
    </span>
  );
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await sessionFetch(`/api/vcut/admin/${path}`, {
    ...init,
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Admin request failed");
  return body;
}
function Modal({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        const items = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
          ) ?? []),
        ];
        const first = items[0],
          last = items.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      previous?.focus();
    };
  }, [busy, onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#111722] p-5 shadow-2xl outline-none"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className={button}
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function AdminConsole() {
  const { user } = useSupabaseSession();
  const [access, setAccess] = useState({ userId: "", error: "" });
  const allowed = !!user && access.userId === user.id && !access.error;
  const accessError = user && access.userId === user.id ? access.error : "";
  const [section, setSection] = useState<Section>("overview"),
    [days, setDays] = useState(30),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [owner, setOwner] = useState(""),
    [projectFilter, setProjectFilter] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null),
    [storage, setStorage] = useState<Storage | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [count, setCount] = useState(0);
  const [settledKey, setSettledKey] = useState(""),
    [requestError, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [updated, setUpdated] = useState("");
  const [requestId, setRequestId] = useState("");
  const [detail, setDetail] = useState<Row | null>(null),
    [action, setAction] = useState<Action | null>(null),
    [reason, setReason] = useState(""),
    [amount, setAmount] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [saving, setSaving] = useState(false),
    [actionError, setActionError] = useState("");
  const dataKey = JSON.stringify([
    user?.id,
    section,
    page,
    query,
    status,
    owner,
    projectFilter,
    days,
    revision,
  ]);
  const loading = allowed && settledKey !== dataKey;
  const error = settledKey === dataKey ? requestError : "";
  useEffect(() => {
    let live = true;
    if (user)
      void request("access")
        .then(() => {
          if (live) setAccess({ userId: user.id, error: "" });
        })
        .catch((e) => {
          if (live) setAccess({ userId: user.id, error: e.message });
        });
    return () => {
      live = false;
    };
  }, [user, revision]);
  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => {
    if (!allowed) return;
    const abort = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      q: query,
      days: String(days),
    });
    if (status) params.set("status", status);
    if (owner) params.set("owner", owner);
    if (projectFilter) params.set("project", projectFilter);
    void request<Overview | Storage | { rows: Row[]; count: number }>(
      `${section}?${params}`,
      { signal: abort.signal },
    )
      .then((data) => {
        if (abort.signal.aborted) return;
        setError("");
        if (section === "overview") setOverview(data as Overview);
        else if (section === "storage") setStorage(data as Storage);
        else {
          const list = data as { rows: Row[]; count: number };
          setRows(list.rows);
          setCount(list.count);
        }
        setUpdated(new Date().toLocaleTimeString());
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setSettledKey(dataKey);
      });
    return () => abort.abort();
  }, [
    allowed,
    section,
    page,
    query,
    status,
    owner,
    projectFilter,
    days,
    revision,
    dataKey,
  ]);
  const navigate = (next: Section, ownerId = "", projectId = "") => {
    setSection(next);
    setPage(1);
    setSearch("");
    setQuery("");
    setStatus("");
    setOwner(ownerId);
    setProjectFilter(projectId);
    setRows([]);
    setCount(0);
    setError("");
    setDetail(null);
  };
  const openAction = (next: Action) => {
    setAction(next);
    setRequestId(crypto.randomUUID());
    setReason("");
    setAmount("");
    setConfirmation("");
    setActionError("");
  };
  const closeAction = useCallback(() => setAction(null), []),
    closeDetail = useCallback(() => setDetail(null), []);
  async function performAction() {
    if (!action || saving) return;
    setSaving(true);
    setActionError("");
    try {
      const result = await request<{ details?: Row }>("actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action.type,
          target: action.target,
          reason,
          requestId,
          value:
            action.type === "credits_adjust"
              ? { amount: Number(amount) }
              : (action.value ?? {}),
        }),
      });
      setNotice(
        action.type === "storage_cleanup"
          ? `Removed ${number(result.details?.removed)} expired exports (${bytes(Number(result.details?.bytes ?? 0))}). Skipped ${number(result.details?.skipped)} changed or unavailable files.`
          : `${action.label} completed. Audit record saved.`,
      );
      setAction(null);
      setDetail(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function actionsFor(row: Row): Action[] {
    const id = String(row.id),
      name = text(row.email ?? row.name ?? row.file_name ?? row.id);
    const make = (
      type: AdminAction,
      label: string,
      value?: Row,
      danger = false,
    ): Action => ({ type, label, target: id, name, value, danger });
    if (section === "users")
      return [
        make(
          row.suspended ? "user_restore" : "user_suspend",
          row.suspended ? "Restore access" : "Suspend access",
          undefined,
          !row.suspended,
        ),
        make("credits_adjust", "Adjust credits"),
      ];
    if (section === "projects")
      return [
        make(
          restricted(row) ? "project_restore" : "project_restrict",
          restricted(row) ? "Restore access" : "Restrict access",
          undefined,
          !restricted(row),
        ),
      ];
    if (
      section === "exports" &&
      ["queued", "processing"].includes(String(row.status))
    )
      return [make("export_cancel", "Cancel export", undefined, true)];
    if (section === "feedback")
      return [
        make("feedback_status", "Review", { status: "reviewing" }),
        make("feedback_status", "Resolve", { status: "resolved" }),
        make("feedback_status", "Reopen", { status: "pending" }),
      ].filter((a) => a.value?.status !== row.status);
    if (section === "reports") {
      const a = [
        make("report_status", "Review", { status: "reviewing" }),
        make("report_status", "Resolve", { status: "resolved" }),
        make("report_status", "Dismiss", { status: "dismissed" }),
      ].filter((a) => a.value?.status !== row.status);
      if (row.target_type === "template")
        a.push({
          type: "template_unpublish",
          target: String(row.target_id),
          label: "Unpublish template",
          name: String(row.target_id),
          danger: true,
        });
      if (row.target_type === "comment")
        a.push({
          type: "comment_remove",
          target: String(row.target_id),
          label: "Remove comment",
          name: String(row.target_id),
          danger: true,
        });
      return a;
    }
    if (section === "templates") {
      const c = row.vcut_admin_template_controls;
      const blocked = !!(Array.isArray(c)
        ? c[0]?.restricted
        : (c as Row | null)?.restricted);
      return blocked
        ? [make("template_restore", "Restore publishing permission")]
        : [make("template_unpublish", "Restrict & unpublish", undefined, true)];
    }
    if (section === "media")
      return [
        make(
          row.hidden ? "media_restore" : "media_hide",
          row.hidden ? "Show in library" : "Hide from library",
        ),
      ];
    if (section === "deletions")
      return [make("deletion_acknowledge", "Acknowledge request")];
    return [];
  }
  function cell(row: Row, key: string): ReactNode {
    if (key === "outcomes") {
      const outcome = row.outcomes as Row;
      return (
        <div className="whitespace-nowrap text-xs">
          <span className="text-emerald-300">
            {number(outcome?.completed)} succeeded
          </span>
          <span className="ml-2 text-rose-300">
            {number(outcome?.failed)} failed
          </span>
          <div className="mt-1 text-slate-500">
            {number(outcome?.active)} active
          </div>
        </div>
      );
    }
    if (key === "restricted")
      return <Badge>{restricted(row) ? "Restricted" : "Available"}</Badge>;
    if (key === "hidden")
      return <Badge>{row.hidden ? "Hidden" : "Visible"}</Badge>;
    if (key === "is_public")
      return <Badge>{row.is_public ? "Public" : "Private"}</Badge>;
    if (key.endsWith("_at") || key === "current_period_end")
      return (
        <span className="whitespace-nowrap text-xs text-slate-400">
          {date(row[key])}
        </span>
      );
    if (key === "size_bytes" || key === "media_bytes")
      return bytes(Number(row[key] ?? 0));
    if (key === "status")
      return (
        <div className="space-y-1">
          <Badge>{text(row.status)}</Badge>
          {row.error_message ? (
            <div
              className="max-w-72 truncate text-xs text-rose-300"
              title={text(row.error_message)}
            >
              {text(row.error_message)}
            </div>
          ) : null}
          {row.cancellation_requested && row.status === "processing" ? (
            <div className="text-xs text-amber-300">Cancellation requested</div>
          ) : null}
        </div>
      );
    if (key === "progress")
      return `${Math.round(Number(row.progress ?? 0) * 100)}%`;
    if (key === "plan")
      return (
        <div>
          <Badge>{text(row.plan)}</Badge>
          <div className="mt-1 text-xs text-slate-400">
            {number(row.credits_remaining)} credits
          </div>
        </div>
      );
    if (key === "email")
      return (
        <div className="max-w-72">
          <div className="truncate font-medium text-white">
            {text(row.email)}
          </div>
          <div className="text-xs text-slate-400">
            {text(row.display_name ?? row.username)}
          </div>
          {row.suspended ? <Badge>Suspended</Badge> : null}
        </div>
      );
    if (key === "file_name")
      return (
        <div className="max-w-64">
          <div className="truncate">{text(row.file_name)}</div>
          <div className="mt-1 truncate font-mono text-xs text-slate-500">
            {text(row.project_id)}
          </div>
        </div>
      );
    if (key.endsWith("_id") || key === "id")
      return (
        <span className="font-mono text-xs" title={text(row[key])}>
          {text(row[key]).slice(0, 16)}
          {text(row[key]).length > 16 ? "…" : ""}
        </span>
      );
    return (
      <div className="max-w-80 truncate" title={text(row[key])}>
        {text(row[key])}
      </div>
    );
  }
  if (user === undefined)
    return <div className="p-10 text-slate-400">Checking your session…</div>;
  if (!user)
    return (
      <div className="m-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold">VCut Admin</h1>
        <p className="my-4 text-slate-400">
          Sign in with an authorized administrator account to continue.
        </p>
        <Link href="/login?next=%2Fadmin" className={button}>
          Sign in
        </Link>
      </div>
    );
  if (!allowed)
    return (
      <div className="m-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-semibold">VCut Admin</h1>
        <p
          className="my-4 text-slate-400"
          role={accessError ? "alert" : "status"}
        >
          {accessError || "Verifying admin access…"}
        </p>
        {accessError && (
          <button className={button} onClick={() => setRevision((n) => n + 1)}>
            Try again
          </button>
        )}
        <Link href="/home" className="ml-4 text-sm text-sky-300">
          Back to VCut
        </Link>
      </div>
    );
  const title = sections.find((s) => s.id === section)!.label;
  return (
    <div className="min-h-dvh bg-[#090e16] text-slate-200 lg:flex">
      <aside className="border-b border-white/10 bg-[#0d131e] lg:fixed lg:inset-y-0 lg:w-60 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between p-5">
          <Link
            href="/home"
            className="text-lg font-bold tracking-tight text-white"
          >
            VCut{" "}
            <span className="ml-2 rounded border border-sky-400/25 bg-sky-400/10 px-2 py-1 text-[10px] uppercase tracking-widest text-sky-300">
              Admin
            </span>
          </Link>
        </div>
        <nav
          aria-label="Administration"
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block"
        >
          {sections.map((s, i) => (
            <div key={s.id} className="shrink-0">
              {(i === 0 || sections[i - 1].group !== s.group) && (
                <div className="mb-2 mt-5 hidden px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 lg:block">
                  {s.group}
                </div>
              )}
              <button
                aria-current={section === s.id ? "page" : undefined}
                onClick={() => navigate(s.id)}
                className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm transition ${section === s.id ? "bg-sky-400/10 font-medium text-sky-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
              >
                {s.label}
              </button>
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:ml-60 lg:p-8">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs text-slate-500">VCut / Administration</p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {title}
            </h1>
            <p className="mt-2 text-xs text-slate-400">
              {user.email}
              {updated ? ` · Updated ${updated}` : ""}
            </p>
          </div>
          <button
            onClick={() => setRevision((n) => n + 1)}
            disabled={loading}
            className={button}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </header>
        {notice && (
          <div
            role="status"
            className="mb-4 flex justify-between gap-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200"
          >
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"
          >
            {error}{" "}
            <button
              className="underline"
              onClick={() => setRevision((n) => n + 1)}
            >
              Retry
            </button>
          </div>
        )}
        {section === "overview" ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">
                Hosted export outcomes · Device exports are not reported here.
              </p>
              <label className="text-sm text-slate-400">
                Export period{" "}
                <select
                  aria-label="Export period"
                  className={`${control} ml-2`}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  {[
                    [7, "Last 7 days"],
                    [30, "Last 30 days"],
                    [90, "Last 90 days"],
                    [0, "All time"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {overview && (
              <>
                {!overview.durableQueue && (
                  <div
                    role="status"
                    className="mb-5 rounded-lg bg-amber-400/10 p-4 text-sm text-amber-200"
                  >
                    Durable queue is disabled. Counts show persisted history
                    only; current in-memory exports are not included.
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    [
                      "Successful exports",
                      overview.exports.completed,
                      "Completed render jobs",
                      "emerald",
                    ],
                    [
                      "Failed exports",
                      overview.exports.failed,
                      "Inspect errors in Exports",
                      "rose",
                    ],
                    [
                      "Projects rendered successfully",
                      overview.exports.successfulProjects,
                      "Distinct projects with a completed job",
                      "sky",
                    ],
                    [
                      "Projects with failures",
                      overview.exports.failedProjects,
                      "May also have successful exports",
                      "amber",
                    ],
                    ["Users", overview.users, "Shared sign-in accounts", "sky"],
                    [
                      "Projects",
                      overview.projects,
                      "Current project index",
                      "sky",
                    ],
                    [
                      "Library storage",
                      bytes(overview.libraryBytes),
                      "Recorded reusable media size",
                      "sky",
                    ],
                    [
                      "Active subscriptions",
                      overview.subscriptions,
                      "Active, trial, or grace period",
                      "sky",
                    ],
                  ].map(([label, value, sub, tone]) => (
                    <div
                      key={String(label)}
                      className="rounded-xl border border-white/10 bg-[#101722] p-5"
                    >
                      <p className="text-xs text-slate-400">{label}</p>
                      <div
                        className={`my-3 text-3xl font-semibold tracking-tight ${tone === "emerald" ? "text-emerald-300" : tone === "rose" ? "text-rose-300" : "text-white"}`}
                      >
                        {typeof value === "number" ? number(value) : value}
                      </div>
                      <p className="text-xs text-slate-500">{sub}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid gap-5 xl:grid-cols-[2fr_1fr]">
                  <div className="rounded-xl border border-white/10 bg-[#101722] p-5">
                    <h2 className="font-medium text-white">
                      Export outcomes by day
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      UTC ·{" "}
                      {days === 0
                        ? "Last 30 days chart; totals are all time"
                        : "Selected period"}{" "}
                      · <span className="text-emerald-300">Successful</span> /{" "}
                      <span className="text-rose-300">Failed</span>
                    </p>
                    <div
                      className="mt-7 flex h-40 items-end gap-1"
                      role="img"
                      aria-label="Daily successful and failed exports"
                    >
                      {overview.daily.map((d) => {
                        const max = Math.max(
                          1,
                          ...overview.daily.map(
                            (v) => Number(v.completed) + Number(v.failed),
                          ),
                        );
                        return (
                          <div
                            key={d.day}
                            tabIndex={0}
                            title={`${d.day}: ${d.completed} successful, ${d.failed} failed`}
                            aria-label={`${d.day}: ${d.completed} successful, ${d.failed} failed`}
                            className="group flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm bg-white/[0.02] outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                          >
                            <div
                              className="min-h-0 bg-rose-400/80"
                              style={{
                                height: `${(Number(d.failed) / max) * 100}%`,
                              }}
                            />
                            <div
                              className="min-h-0 bg-emerald-400/80"
                              style={{
                                height: `${(Number(d.completed) / max) * 100}%`,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                      <span>{overview.daily[0]?.day}</span>
                      <span>{overview.daily.at(-1)?.day}</span>
                    </div>
                    <p className="mt-5 text-xs text-slate-400">
                      {number(overview.exports.cancelled)} cancelled ·{" "}
                      {number(overview.exports.total)} total jobs · Average
                      completed render:{" "}
                      {overview.exports.averageSeconds === null
                        ? "—"
                        : `${Math.round(overview.exports.averageSeconds)}s`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#101722] p-5">
                    <h2 className="mb-4 font-medium text-white">
                      Needs attention
                    </h2>
                    {(
                      [
                        ["Queued exports", overview.queue.queued, "exports"],
                        [
                          "Processing exports",
                          overview.queue.processing,
                          "exports",
                        ],
                        [
                          "Stalled worker leases",
                          overview.queue.stalled,
                          "exports",
                        ],
                        ["Feedback", overview.pendingFeedback, "feedback"],
                        ["Content reports", overview.pendingReports, "reports"],
                        [
                          "Deletion requests",
                          overview.pendingDeletions,
                          "deletions",
                        ],
                      ] as const
                    ).map(([label, value, target]) => (
                      <button
                        key={label}
                        className="flex min-h-11 w-full items-center justify-between border-b border-white/5 text-sm hover:text-sky-300"
                        onClick={() => navigate(target)}
                      >
                        <span>{label}</span>
                        <span
                          className={
                            value > 0
                              ? "font-medium text-amber-200"
                              : "text-slate-500"
                          }
                        >
                          {number(value)} →
                        </span>
                      </button>
                    ))}
                    <p className="mt-5 text-xs text-slate-500">
                      Durable queue{" "}
                      {overview.durableQueue ? "enabled" : "disabled"} ·
                      Embedded worker{" "}
                      {overview.embeddedWorker ? "enabled" : "disabled"}. Worker
                      lease activity is shown above.
                    </p>
                  </div>
                </div>
              </>
            )}
          </>
        ) : section === "storage" ? (
          <>
            <p className="mb-5 max-w-3xl text-sm leading-relaxed text-slate-400">
              Mounted VCut data volume. Cleanup removes only exports older than
              24 hours from projects without active export jobs. Source media,
              project files, libraries, and templates are preserved. External
              object storage is not included.
            </p>
            {storage && (
              <>
                {(storage.incomplete || storage.unreadable > 0) && (
                  <div
                    role="status"
                    className="mb-4 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200"
                  >
                    Partial inventory: {number(storage.unreadable)} unreadable
                    entries{storage.incomplete ? "; scan limit reached" : ""}.
                    Totals below are lower bounds.
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Stored data", bytes(storage.bytes)],
                    ["Files", number(storage.fileCount)],
                    [
                      "Volume available",
                      storage.disk
                        ? bytes(storage.disk.availableBytes)
                        : "Unavailable",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/10 bg-[#101722] p-5"
                    >
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="mt-3 text-2xl font-semibold text-white">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="my-5 rounded-xl border border-white/10 bg-[#101722] p-5">
                  <h2 className="font-medium text-white">Expired exports</h2>
                  <p className="my-3 text-sm text-slate-400">
                    {number(storage.expiredFiles)} eligible files ·{" "}
                    {bytes(storage.reclaimableBytes)} reclaimable. Up to 1,000
                    files per cleanup.
                  </p>
                  <button
                    className={button}
                    disabled={
                      loading ||
                      !!error ||
                      !storage.cleanupEnabled ||
                      storage.expiredFiles === 0
                    }
                    onClick={() =>
                      openAction({
                        type: "storage_cleanup",
                        target: "expired_exports",
                        name: `${number(storage.expiredFiles)} expired exports`,
                        label: "Clean expired exports",
                        danger: true,
                      })
                    }
                  >
                    Clean expired exports
                  </button>
                  {!storage.cleanupEnabled && (
                    <p className="mt-3 text-sm text-amber-200">
                      Cleanup requires the durable queue to identify active
                      projects safely.
                    </p>
                  )}
                </div>
                <div className="grid gap-5 xl:grid-cols-[1fr_2fr]">
                  <div className="rounded-xl border border-white/10 p-5">
                    <h2 className="mb-4 font-medium text-white">
                      Storage breakdown
                    </h2>
                    {Object.entries(storage.categories).map(([label, data]) => (
                      <div
                        key={label}
                        className="flex justify-between gap-4 border-b border-white/5 py-3 text-sm"
                      >
                        <span>
                          {label}
                          <span className="ml-2 text-xs text-slate-500">
                            {number(data.files)} files
                          </span>
                        </span>
                        <span>{bytes(data.bytes)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 rounded-xl border border-white/10 p-5">
                    <h2 className="mb-4 font-medium text-white">
                      Largest files
                    </h2>
                    {storage.largest.length ? (
                      storage.largest.map((file) => (
                        <div
                          key={file.relativePath}
                          className="flex justify-between gap-4 border-b border-white/5 py-3 text-xs"
                        >
                          <span className="min-w-0 break-all font-mono text-slate-400">
                            {file.relativePath}
                          </span>
                          <span className="shrink-0">{bytes(file.bytes)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        No files found on this volume.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {section === "deletions" && (
              <p className="mb-5 text-sm text-amber-200">
                Acknowledging records the review; it does not delete an account
                or its data. Follow the verified deletion runbook and handle
                external billing separately.
              </p>
            )}
            {section === "subscriptions" && (
              <p className="mb-5 text-sm text-slate-400">
                Provider-confirmed billing records. Change paid subscriptions
                through their billing provider.
              </p>
            )}
            {section === "media" && (
              <p className="mb-5 text-sm text-slate-400">
                Hiding changes library visibility and preserves files used by
                projects. Physical deletion of source media is intentionally
                separate.
              </p>
            )}
            <div className="mb-4 flex flex-wrap gap-3">
              <input
                aria-label={`Search ${title}`}
                type="search"
                placeholder={
                  section === "users" || section === "deletions"
                    ? "Search email, name, or user ID…"
                    : "Search names, messages, or IDs…"
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${control} min-w-0 flex-1 sm:min-w-64`}
                maxLength={120}
              />
              {statuses[section] && (
                <select
                  aria-label="Filter status"
                  className={control}
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {statuses[section]!.map((s) => (
                    <option key={s} value={s}>
                      {s.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              )}
              {projectFilter && (
                <button
                  className={button}
                  onClick={() => {
                    setProjectFilter("");
                    setPage(1);
                  }}
                >
                  Project {projectFilter.slice(0, 12)} · Clear ×
                </button>
              )}
              {owner && (
                <button
                  className={button}
                  onClick={() => {
                    setOwner("");
                    setPage(1);
                  }}
                >
                  User {owner.slice(0, 8)} · Clear ×
                </button>
              )}
            </div>
            <div
              className="overflow-hidden rounded-xl border border-white/10 bg-[#101722]"
              aria-busy={loading}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.02] text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      {columns[section]?.map((c) => (
                        <th
                          key={c.key}
                          scope="col"
                          className="px-4 py-3 font-medium"
                        >
                          {c.label}
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-3 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rows.map((row) => (
                      <tr
                        key={String(row.id)}
                        className="hover:bg-white/[0.02]"
                      >
                        {columns[section]?.map((c) => (
                          <td key={c.key} className="px-4 py-4">
                            {cell(row, c.key)}
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <button
                            disabled={loading || !!error}
                            className={`${button} whitespace-nowrap text-xs`}
                            onClick={() => setDetail(row)}
                          >
                            Details & actions
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && (
                <div className="p-12 text-center text-sm text-slate-500">
                  {loading
                    ? "Loading records…"
                    : error
                      ? "Records could not be loaded."
                      : "No records match this view."}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-slate-400">
                <span>
                  {number(count)} records · Page {page} of{" "}
                  {Math.max(1, Math.ceil(count / 25))}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={loading || page <= 1}
                    className={button}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    disabled={loading || page * 25 >= count}
                    className={button}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        {loading && (
          <p role="status" className="mt-5 text-sm text-slate-500">
            Loading current data…
          </p>
        )}
        {detail && !action && (
          <Modal title="Record details" onClose={closeDetail}>
            <div className="mb-5 flex flex-wrap gap-2">
              {actionsFor(detail).map((a) => (
                <button
                  key={`${a.type}-${a.label}`}
                  className={`${button} ${a.danger ? "text-rose-300" : ""}`}
                  onClick={() => openAction(a)}
                >
                  {a.label}
                </button>
              ))}
              {(detail.owner_id || detail.user_id || section === "users") && (
                <>
                  <button
                    className={button}
                    onClick={() =>
                      navigate(
                        "projects",
                        String(detail.owner_id ?? detail.user_id ?? detail.id),
                      )
                    }
                  >
                    View projects
                  </button>
                  <button
                    className={button}
                    onClick={() =>
                      section === "projects"
                        ? navigate("exports", "", String(detail.id))
                        : navigate(
                            "exports",
                            String(
                              detail.owner_id ?? detail.user_id ?? detail.id,
                            ),
                          )
                    }
                  >
                    View exports
                  </button>
                  <button
                    className={button}
                    onClick={() =>
                      navigate(
                        "media",
                        String(detail.owner_id ?? detail.user_id ?? detail.id),
                      )
                    }
                  >
                    View media
                  </button>
                </>
              )}
            </div>
            <dl className="space-y-4">
              {Object.entries(detail).map(([key, value]) => (
                <div key={key}>
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                    {key.replaceAll("_", " ")}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words text-sm text-slate-200">
                    {typeof value === "object" && value !== null ? (
                      <pre className="overflow-x-auto rounded-lg bg-black/20 p-3 text-xs">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      text(value)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Modal>
        )}
        {action && (
          <Modal title={action.label} onClose={closeAction} busy={saving}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void performAction();
              }}
            >
              <p className="mb-2 text-sm text-slate-400">
                Target:{" "}
                <span className="break-all text-white">{action.name}</span>
              </p>
              <p className="mb-5 break-all font-mono text-xs text-slate-500">
                {action.target}
              </p>
              {action.type === "user_suspend" && (
                <p className="mb-4 text-sm text-amber-200">
                  Blocks VCut server access. This does not ban the shared
                  sign-in account from other apps or cancel a subscription.
                </p>
              )}
              {action.type === "project_restrict" && (
                <p className="mb-4 text-sm text-amber-200">
                  Blocks owner and reviewer access to this project. Cancel any
                  running export separately.
                </p>
              )}
              {action.type === "credits_adjust" && (
                <label className="mb-4 block text-sm">
                  Credit change (positive to grant, negative to remove)
                  <input
                    required
                    type="number"
                    min={-10000}
                    max={10000}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`${control} mt-2 w-full`}
                    disabled={saving}
                  />
                </label>
              )}
              <label className="block text-sm">
                Reason for this change
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={`${control} mt-2 w-full resize-y`}
                  disabled={saving}
                  placeholder="Support ticket, moderation decision, or maintenance reason…"
                />
              </label>
              {action.danger && (
                <label className="mt-4 block text-sm">
                  Type CONFIRM to proceed
                  <input
                    required
                    pattern="CONFIRM"
                    autoComplete="off"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    className={`${control} mt-2 w-full`}
                    disabled={saving}
                  />
                </label>
              )}
              {actionError && (
                <p role="alert" className="mt-4 text-sm text-rose-300">
                  {actionError}
                </p>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  className={button}
                  onClick={closeAction}
                >
                  Cancel
                </button>
                <button
                  disabled={
                    saving ||
                    reason.trim().length < 5 ||
                    (action.danger && confirmation !== "CONFIRM") ||
                    (action.type === "credits_adjust" &&
                      (!Number.isInteger(Number(amount)) ||
                        Number(amount) === 0))
                  }
                  className={`${button} ${action.danger ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-sky-400/30 bg-sky-400/10 text-sky-200"}`}
                >
                  {saving ? "Saving…" : action.label}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </main>
    </div>
  );
}
