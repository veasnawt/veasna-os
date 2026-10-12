import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  adminPageParams,
  isAdminIdentity,
  parseAdminAction,
} from "../app/api/vcut/_lib/adminPolicy.ts";
import {
  expiredAdminExports,
  inspectAdminStorage,
  removeExpiredAdminExport,
} from "../app/api/vcut/_lib/adminStorage.ts";

test("admin permission requires an exact configured identity and never editable metadata", () => {
  assert.equal(
    isAdminIdentity(
      { id: "user", email: "OWNER@example.com" },
      "",
      " owner@example.com ",
    ),
    true,
  );
  assert.equal(
    isAdminIdentity(
      { id: "user", email: "owner@example.com.evil" },
      "",
      "owner@example.com",
    ),
    false,
  );
  assert.equal(
    isAdminIdentity({ id: "user", email: "owner@example.com" }),
    false,
  );
  assert.equal(
    isAdminIdentity({ id: "user", email: null }, "other,user"),
    true,
  );
});
test("actions reject invalid credit amounts, missing reasons, status changes, and request IDs", () => {
  const valid = {
    action: "credits_adjust",
    target: "user_id",
    reason: "Support correction",
    value: { amount: 10 },
    requestId: crypto.randomUUID(),
  };
  assert.equal(parseAdminAction(valid).value.amount, 10);
  for (const amount of [0, 0.5, 10001, -10001, "10", null])
    assert.throws(() => parseAdminAction({ ...valid, value: { amount } }));
  assert.throws(() => parseAdminAction({ ...valid, reason: " " }));
  assert.throws(() => parseAdminAction({ ...valid, target: "../escape" }));
  assert.throws(() => parseAdminAction({ ...valid, requestId: undefined }));
  assert.throws(() =>
    parseAdminAction({
      ...valid,
      action: "feedback_status",
      value: { status: "deleted" },
    }),
  );
});
test("search cannot inject PostgREST operators and pagination is bounded", () => {
  const p = adminPageParams(
    new URL("https://vcut.io/admin?q=x%29%2Cid.eq.secret%28"),
  );
  assert.ok(!/[(),]/.test(p.term));
  assert.throws(() => adminPageParams(new URL("https://vcut.io/admin?page=0")));
  assert.throws(() =>
    adminPageParams(new URL("https://vcut.io/admin?page=1.5")),
  );
});
test("storage cleanup preserves source files, recent exports, active projects, and symlink targets", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vcut-admin-storage-"));
  const outside = await fs.mkdtemp(
    path.join(os.tmpdir(), "vcut-admin-outside-"),
  );
  try {
    const files = [
      "old/exports/old.mp4",
      "old/media/source.mp4",
      "active/exports/old.mp4",
      "recent/exports/new.mp4",
    ];
    for (const file of files) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), "video");
      if (!file.startsWith("recent")) {
        const ago = new Date(Date.now() - 172800000);
        await fs.utimes(path.join(root, file), ago, ago);
      }
    }
    await fs.writeFile(path.join(outside, "keep.mp4"), "outside");
    await fs.symlink(outside, path.join(root, "linked"));
    let inventory = await inspectAdminStorage(root);
    assert.equal(inventory.fileCount, 4);
    const eligible = expiredAdminExports(inventory.files, new Set(["active"]));
    assert.deepEqual(
      eligible.map((f) => f.relativePath),
      ["old/exports/old.mp4"],
    );
    assert.equal(removeExpiredAdminExport(root, eligible[0]), true);
    assert.equal(
      await fs.readFile(path.join(root, "old/media/source.mp4"), "utf8"),
      "video",
    );
    assert.equal(
      await fs.readFile(path.join(outside, "keep.mp4"), "utf8"),
      "outside",
    );
    inventory = await inspectAdminStorage(root, 1);
    assert.equal(inventory.incomplete, true);
    // A symlink substituted after scanning must not redirect deletion outside the volume.
    const candidate = (await inspectAdminStorage(root)).files.find(
      (f) => f.relativePath === "active/exports/old.mp4",
    )!;
    await fs.rename(
      path.join(root, "active/exports"),
      path.join(root, "active/saved"),
    );
    await fs.symlink(outside, path.join(root, "active/exports"));
    assert.equal(removeExpiredAdminExport(root, candidate), false);
    assert.equal(
      removeExpiredAdminExport(root, {
        ...candidate,
        relativePath: "../escape/exports/file",
      }),
      false,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
