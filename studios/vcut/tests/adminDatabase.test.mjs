import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
let db;
const actor = "00000000-0000-4000-8000-000000000001",
  user = "00000000-0000-4000-8000-000000000002";
const request = () => crypto.randomUUID();
async function action(name, target, value = {}, id = request()) {
  return (
    await db.query("select vcut_admin_action($1,$2,$3,$4,$5,$6) as result", [
      actor,
      name,
      target,
      JSON.stringify(value),
      "Verified support ticket",
      id,
    ])
  ).rows[0].result;
}
before(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql as 'select null::uuid';`,
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(file, dir), "utf8"));
  await db.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [
    actor,
    "admin@example.com",
    user,
    "member@example.com",
  ]);
  await db.query("insert into profiles(id,credits_remaining) values($1,100)", [
    user,
  ]);
  await db.query(
    "insert into projects_index(id,owner_id,name) values('project_a',$1,'Project A'),('project_b',$1,'Project B')",
    [user],
  );
  await db.query(
    "insert into templates(id,owner_id,name,project,is_public) values('template_a',$1,'Template','{}',true)",
    [user],
  );
  await db.query(
    "insert into vcut_export_jobs(id,project_id,user_id,status,file_name,project_snapshot,started_at,completed_at) values($1,'project_a',$2,'completed','one.mp4','{}',now()-interval '10 seconds',now()),($3,'project_a',$2,'failed','two.mp4','{}',now()-interval '5 seconds',now()),($4,'project_b',$2,'completed','three.mp4','{}',now()-interval '8 seconds',now())",
    [request(), user, request(), request()],
  );
});
after(async () => {
  await db?.close();
});
test("overview distinguishes render jobs and distinct projects", async () => {
  const result = (await db.query("select vcut_admin_overview(30) as summary"))
    .rows[0].summary;
  assert.equal(result.exports.completed, 2);
  assert.equal(result.exports.failed, 1);
  assert.equal(result.exports.successfulProjects, 2);
  assert.equal(result.exports.failedProjects, 1);
  assert.equal(result.daily.length, 30);
  const rows = (
    await db.query(
      "select * from vcut_admin_project_outcomes(array['project_a'])",
    )
  ).rows;
  assert.equal(Number(rows[0].completed), 1);
  assert.equal(Number(rows[0].failed), 1);
});
test("credit adjustments are atomic, audited, and idempotent", async () => {
  const id = request();
  await action("credits_adjust", user, { amount: 25 }, id);
  await action("credits_adjust", user, { amount: 25 }, id);
  assert.equal(
    (
      await db.query("select credits_remaining from profiles where id=$1", [
        user,
      ])
    ).rows[0].credits_remaining,
    125,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from credit_transactions where user_id=$1",
        [user],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(() => action("credits_adjust", user, { amount: -1000 }));
  assert.equal(
    (
      await db.query("select credits_remaining from profiles where id=$1", [
        user,
      ])
    ).rows[0].credits_remaining,
    125,
  );
  await assert.rejects(
    () => action("credits_adjust", user, { amount: 50 }, id),
    /Request ID already used/,
  );
});
test("restriction controls restore cleanly and prevent self-suspension", async () => {
  await assert.rejects(() => action("user_suspend", actor), /yourself/);
  await action("user_suspend", user);
  assert.equal(
    (
      await db.query(
        "select suspended from vcut_admin_user_controls where user_id=$1",
        [user],
      )
    ).rows[0].suspended,
    true,
  );
  await action("user_restore", user);
  await action("project_restrict", "project_a");
  assert.equal(
    (
      await db.query(
        "select restricted from vcut_admin_project_controls where project_id='project_a'",
      )
    ).rows[0].restricted,
    true,
  );
  await action("project_restore", "project_a");
});
test("moderated templates cannot be republished until explicitly restored", async () => {
  await action("template_unpublish", "template_a");
  await assert.rejects(
    () => db.exec("update templates set is_public=true where id='template_a'"),
    /restricted by moderation/,
  );
  await action("template_restore", "template_a");
  await db.exec("update templates set is_public=true where id='template_a'");
});
test("an audit insert failure rolls back the resource change", async () => {
  await db.exec(
    "create function reject_test_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end;$$;create trigger reject_test_audit before insert on vcut_admin_audit for each row execute function reject_test_audit();",
  );
  try {
    await assert.rejects(
      () => action("credits_adjust", user, { amount: 5 }),
      /audit unavailable/,
    );
    assert.equal(
      (
        await db.query("select credits_remaining from profiles where id=$1", [
          user,
        ])
      ).rows[0].credits_remaining,
      125,
    );
  } finally {
    await db.exec(
      "drop trigger reject_test_audit on vcut_admin_audit;drop function reject_test_audit();",
    );
  }
});
test("ordinary database roles cannot read private controls or execute admin RPCs", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(
        () => db.query("select * from vcut_admin_audit"),
        /permission denied/,
      );
      await assert.rejects(
        () => db.query("select vcut_admin_overview(30)"),
        /permission denied/,
      );
      await assert.rejects(
        () => db.query("select vcut_admin_users()"),
        /permission denied/,
      );
      await assert.rejects(
        () => action("user_suspend", user),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});

test("support triage and media controls update records without deleting user data", async () => {
  const feedback = request(),
    report = request();
  await db.query(
    "insert into user_feedback(id,user_id,category,message) values($1,$2,'bug','Export failed on my device')",
    [feedback, user],
  );
  await db.query(
    "insert into content_reports(id,reporter_id,target_type,target_id,target_owner_id,reason) values($1,$2,'template','template_a',$2,'spam')",
    [report, user],
  );
  await db.query(
    "insert into user_media(id,owner_id,kind,name,rel_path,size_bytes) values('media_a',$1,'video','Clip','media/clip.mp4',2000)",
    [user],
  );
  await action("feedback_status", feedback, { status: "resolved" });
  await action("report_status", report, { status: "dismissed" });
  assert.equal(
    (await db.query("select status from user_feedback where id=$1", [feedback]))
      .rows[0].status,
    "resolved",
  );
  await action("media_hide", "media_a");
  assert.equal(
    Number(
      (
        await db.query(
          "select hidden,size_bytes from user_media where id='media_a'",
        )
      ).rows[0].size_bytes,
    ),
    2000,
  );
  await action("media_restore", "media_a");
  await action("deletion_acknowledge", user);
  assert.ok(
    (
      await db.query(
        "select deletion_reviewed_at from vcut_admin_user_controls where user_id=$1",
        [user],
      )
    ).rows[0].deletion_reviewed_at,
  );
  assert.equal(
    (
      await db.query("select count(*)::int as n from auth.users where id=$1", [
        user,
      ])
    ).rows[0].n,
    1,
  );
});
test("cancel queued jobs immediately and ask workers to stop processing jobs", async () => {
  const queued = request(),
    processing = request();
  await db.query(
    "insert into vcut_export_jobs(id,project_id,user_id,status,file_name,project_snapshot) values($1,'project_a',$3,'queued','queued.mp4','{}'),($2,'project_b',$3,'processing','active.mp4','{}')",
    [queued, processing, user],
  );
  await action("export_cancel", queued);
  await action("export_cancel", processing);
  const rows = (
    await db.query(
      "select id,status,cancellation_requested from vcut_export_jobs where id=any($1::uuid[])",
      [[queued, processing]],
    )
  ).rows;
  assert.equal(rows.find((row) => row.id === queued).status, "cancelled");
  assert.equal(rows.find((row) => row.id === processing).status, "processing");
  assert.equal(
    rows.find((row) => row.id === processing).cancellation_requested,
    true,
  );
  await assert.rejects(
    () => action("export_cancel", queued),
    /no longer active/,
  );
});
