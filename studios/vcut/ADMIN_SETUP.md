# VCut administration

The web console lives at `/admin`. Authorized accounts also see **Open admin dashboard** on Me. It is a web/server feature and does not require a new mobile binary.

## Enable access

1. Apply existing Supabase migrations through `0021`, then apply [`0022_admin_console.sql`](supabase/migrations/0022_admin_console.sql) **before deploying this code**. Migration 0022 adds private controls/audit tables, restricted server functions, and a template moderation trigger. Normal hosted API access fails closed if its controls cannot be read.
2. On the hosted VCut server, set `VCUT_ADMIN_USER_IDS` to comma-separated Supabase user UUIDs, or set `VCUT_ADMIN_EMAILS` to the intended accounts' exact sign-in emails. Both are server-only. An empty allowlist grants nobody access. The initial requested email is configured in this checkout's ignored `.env.local`; production needs its own server variable. Prefer a UUID for lasting access even if an email changes.
3. Keep `VCUT_HOSTED=true`, the existing Supabase URL/service-role key, and the matching public auth configuration. Never put the service-role key or admin allowlist in `NEXT_PUBLIC_*` variables.
4. Enable `VCUT_DURABLE_QUEUE=true` and run a dedicated export worker or set `VCUT_WORKER_EMBEDDED=true` on the web service. Verify the deployment's worker topology before enabling an additional worker. Durable queue state drives live render statistics and protects active projects during cleanup.
5. Deploy the web service, sign in with the allowlisted account, and open `/admin`. Verify an ordinary account receives 403 from `/api/vcut/admin/access` and all other admin endpoints.

Production rollout completed on 2026-10-12. The owner applied migration 0022 manually; subsequent service-role checks verified all four private tables and the overview function. Railway deployment `e43cd186-3fa3-4f01-a4ac-09f348f02e87` shipped source commit `a141600` and reached SUCCESS. The confirmed account `veasnawt@gmail.com` is allowlisted by its user UUID. Existing durable queue, embedded worker, and `/data` volume configuration were preserved; startup logs confirmed the export worker started.

Live verification: `https://vcut.io/admin` returns 200 with noindex metadata; admin access/overview/storage and action requests without authentication return 401 with private/no-store headers. Query-string credentials and invalid bearer tokens are rejected. Anonymous Supabase requests cannot read the audit table or execute the overview function. Signed-in administrator and ordinary-account browser checks still require their respective sessions. No production user restriction, credit adjustment, or cleanup was performed during rollout.

## Available operations

| Area | Capability |
| --- | --- |
| Overview | Inventory totals; render jobs completed/failed/cancelled; distinct projects with success/failure; UTC daily outcomes; queue and stalled lease counts; support queues |
| Users | Search email/name/UUID; plan, credits, storage, activity; VCut server suspension/restoration; credit adjustments; related projects/media/exports |
| Projects | Owner, recent edits, per-project render outcomes; restrict/restore owner and reviewer access; related export history |
| Exports | Search/filter status and project/owner; progress, attempts, errors, timestamps; cancel queued/running jobs |
| Support | Feedback triage; report review/resolution/dismissal; acknowledge account-deletion requests |
| Moderation | Restrict and unpublish templates; restore publishing permission; remove reported comments |
| Media/storage | Account library inventory and sizes; hide/show library entries; bounded mounted-volume inventory, largest files, free space, expired export cleanup |
| Billing | Read provider-confirmed subscriptions and credit transaction history |
| Audit | Search actions, targets and reasons; inspect administrator, timestamp and action details |

Restrictions and credit edits require a reason. Destructive actions also require typing CONFIRM. Database mutations and their audit entry commit together. A request UUID makes retrying the same credit adjustment idempotent. Normal media access caches successful control checks for up to five seconds; admin actions invalidate that cache on their instance, and other instances observe changes within five seconds. Privileged sessions are verified afresh for every request. Neither editable user metadata nor a local IP grants admin permission.

A VCut suspension blocks its authenticated server APIs. It does not ban the shared Supabase identity, cancel external subscriptions, or stop offline editing. Already-running exports need separate cancellation. Template restrictions are enforced by a database trigger, including direct client attempts to republish. Restoring permission leaves the template private until its owner publishes it again.

## Reporting limits

Export counts cover persisted **hosted server jobs** since durable history was enabled. Native and browser Device exports are not reported to this table. Successful/failed job totals are distinct from successful/failed project totals; a project may appear in both project outcome counts. Changing the date range changes export metrics, while user/project/storage totals remain current inventory. The all-time view charts the last 30 UTC days. Stalled leases are a queue indicator, not a complete health check of an external worker service.

Paid plans remain controlled by verified billing providers. The console does not fabricate subscription status. Credit adjustments change the current balance and preserve the existing reset schedule; inspect the ledger/audit before retrying an action with a new request ID after a network error.

Deletion acknowledgement records support review only. It does not claim that identity, media, project data, provider subscriptions, or backups were deleted. Process an independently verified deletion request with the service's retention/deletion procedures and keep an audit record. Shared auth identities may also belong to other Veasna apps.

## Storage cleanup

The inventory reads only the configured mounted VCut root, skips symlinks, bounds traversal at 100,000 entries / ten levels, and reports unreadable entries or incomplete scans. It excludes external buckets and worker volumes not mounted on this web instance. Recorded library sizes and measured disk usage are deliberately separate.

Manual cleanup deletes at most 1,000 files per request, exclusively direct files in `<project>/exports/` older than 24 hours. Projects with queued/processing exports are excluded, and file size/mtime/type and all parent directories are rechecked before unlinking. Source media, timelines, reusable libraries, templates, and scratch files remain intact. Hidden library items still consume storage and remain usable by existing projects. Cleanup requires the durable queue and records a started audit entry before touching files, then records removed bytes/files and skips. An interrupted cleanup remains visible as started; investigate it before starting another.

## Validation

```sh
pnpm --filter vcut test:admin
pnpm --filter vcut exec tsc --noEmit
pnpm --filter vcut build
```

Admin tests use an isolated PGlite PostgreSQL engine to apply all migrations and check metrics, private role privileges, audited/atomic/idempotent credit changes, rollback, restrictions, moderation, support workflow and cancellation. HTTP auth tests verify fresh token validation and deny unauthenticated, unprivileged and metadata-forged requests. Filesystem tests preserve source/recent/active files and refuse symlink substitution. No test connects to production data.

The React UI was additionally exercised in Chrome with fixture API responses at desktop and 390px phone widths: overview, pagination, debounced search, credit changes, project filters, cleanup confirmation, signed-out/access-denied states, and horizontal overflow. Preview fixture screenshots are not production metrics.
