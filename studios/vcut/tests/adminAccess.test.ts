import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  adminRoute,
  assertVcutUserEnabled,
  assertVcutProjectEnabled,
  invalidateAdminAccess,
} from "../app/api/vcut/_lib/admin.ts";
let verificationCalls = 0,
  protectedCalls = 0;
let suspended = false,
  restricted = false,
  controlFailure = false,
  userReads = 0;
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url?.startsWith("/rest/v1/vcut_admin_")) {
    if (controlFailure) {
      res.statusCode = 503;
      res.end('{"message":"Unavailable"}');
      return;
    }
    if (req.url.includes("user_controls")) {
      userReads++;
      res.end(JSON.stringify(suspended ? [{ suspended: true }] : []));
    } else res.end(JSON.stringify(restricted ? [{ restricted: true }] : []));
    return;
  }
  if (req.url !== "/auth/v1/user") {
    res.statusCode = 500;
    res.end('{"message":"Unexpected backend call"}');
    return;
  }
  verificationCalls++;
  const token = req.headers.authorization;
  if (token !== "Bearer valid-admin" && token !== "Bearer ordinary-user") {
    res.statusCode = 401;
    res.end('{"message":"Invalid session"}');
    return;
  }
  res.end(
    JSON.stringify({
      id: "00000000-0000-4000-8000-000000000001",
      email:
        token === "Bearer valid-admin"
          ? "owner@example.com"
          : "member@example.com",
      app_metadata: {},
      user_metadata: { role: "admin", is_admin: true },
      aud: "authenticated",
      created_at: new Date().toISOString(),
    }),
  );
});
before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.VCUT_HOSTED = "true";
  process.env.VCUT_ADMIN_EMAILS = "owner@example.com";
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
});
const protectedRoute = adminRoute(async () => {
  protectedCalls++;
  return { ok: true };
});
test("privileged endpoints reject missing and query-string credentials before accessing data", async () => {
  for (const url of [
    "https://vcut.io/api/vcut/admin/users",
    "https://vcut.io/api/vcut/admin/users?token=valid-admin",
  ]) {
    const response = await protectedRoute(new Request(url));
    assert.equal(response.status, 401);
  }
  assert.equal(protectedCalls, 0);
});
test("editable metadata cannot make an ordinary account an administrator", async () => {
  const response = await protectedRoute(
    new Request("https://vcut.io/api/vcut/admin/users", {
      headers: { Authorization: "Bearer ordinary-user" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(protectedCalls, 0);
});
test("authorized requests verify fresh sessions and return private uncached responses", async () => {
  const initial = verificationCalls;
  for (let i = 0; i < 2; i++) {
    const response = await protectedRoute(
      new Request("https://vcut.io/api/vcut/admin/users", {
        headers: { Authorization: "Bearer valid-admin" },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  assert.equal(verificationCalls - initial, 2);
  assert.equal(protectedCalls, 2);
  process.env.VCUT_ADMIN_EMAILS = "";
  const denied = await protectedRoute(
    new Request("https://vcut.io/api/vcut/admin/users", {
      headers: { Authorization: "Bearer valid-admin" },
    }),
  );
  assert.equal(denied.status, 403);
  assert.equal(protectedCalls, 2);
});
test("local IP or development mode never bypasses admin verification", async () => {
  process.env.VCUT_HOSTED = "false";
  const response = await protectedRoute(
    new Request("http://localhost/api/vcut/admin/users", {
      headers: {
        Authorization: "Bearer valid-admin",
        "x-forwarded-for": "127.0.0.1",
      },
    }),
  );
  assert.equal(response.status, 503);
});

test("normal media access caches briefly, invalidates after admin changes, and fails closed", async () => {
  const id = "00000000-0000-4000-8000-000000000099";
  await assertVcutUserEnabled(id);
  await assertVcutUserEnabled(id);
  assert.equal(userReads, 1);
  suspended = true;
  invalidateAdminAccess(id);
  await assert.rejects(() => assertVcutUserEnabled(id), /suspended/);
  suspended = false;
  await assertVcutUserEnabled(id);
  await assertVcutProjectEnabled("project_a");
  restricted = true;
  invalidateAdminAccess("project_a");
  await assert.rejects(
    () => assertVcutProjectEnabled("project_a"),
    /restricted/,
  );
  controlFailure = true;
  invalidateAdminAccess(id);
  await assert.rejects(
    () => assertVcutUserEnabled(id),
    /temporarily unavailable/,
  );
});
