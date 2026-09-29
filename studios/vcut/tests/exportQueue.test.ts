import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createProject } from "../../../packages/vcut/src/project/createProject.ts";
import { MemoryExportJobStore } from "../app/api/vcut/_lib/exportQueue.ts";

describe("Durable Export Queue & Worker Orchestration", () => {
  const dummyProject = createProject("test-proj-1", "Test Render");

  test("enqueues a job with initial queued state", async () => {
    const store = new MemoryExportJobStore();
    const job = await store.createJob({
      projectId: "proj-123",
      userId: "user-456",
      fileName: "render.mp4",
      project: dummyProject,
      includeOutro: true,
    });

    assert.ok(job.id);
    assert.equal(job.status, "queued");
    assert.equal(job.phase, "queued");
    assert.equal(job.progress, 0.0);
    assert.equal(job.attemptCount, 0);
    assert.equal(job.cancellationRequested, false);
  });

  test("findActiveJob prevents duplicate project exports", async () => {
    const store = new MemoryExportJobStore();
    const job = await store.createJob({
      projectId: "proj-active",
      userId: "user-1",
      fileName: "active.mp4",
      project: dummyProject,
      includeOutro: false,
    });

    const active = await store.findActiveJob("proj-active");
    assert.ok(active);
    assert.equal(active.id, job.id);

    const none = await store.findActiveJob("proj-nonexistent");
    assert.equal(none, null);
  });

  test("atomic job claim assigns worker and transitions status to processing", async () => {
    const store = new MemoryExportJobStore();
    const job = await store.createJob({
      projectId: "proj-claim",
      userId: "user-1",
      fileName: "claim.mp4",
      project: dummyProject,
      includeOutro: true,
    });

    const worker1 = "worker-alpha";
    const claimed = await store.claimJob(worker1);
    assert.ok(claimed);
    assert.equal(claimed.id, job.id);
    assert.equal(claimed.status, "processing");
    assert.equal(claimed.phase, "preparing");
    assert.equal(claimed.workerId, worker1);
    assert.equal(claimed.attemptCount, 1);
    assert.ok(claimed.heartbeatAt);

    // Second worker cannot claim the same job (no duplicate execution)
    const worker2 = "worker-beta";
    const secondClaim = await store.claimJob(worker2);
    assert.equal(secondClaim, null, "Already claimed job must not be claimed by another worker");
  });

  test("heartbeat updates progress and checks cancellation", async () => {
    const store = new MemoryExportJobStore();
    const job = await store.createJob({
      projectId: "proj-hb",
      userId: "user-1",
      fileName: "hb.mp4",
      project: dummyProject,
      includeOutro: false,
    });

    const workerId = "worker-alpha";
    await store.claimJob(workerId);

    // Normal heartbeat update
    const cancelled = await store.heartbeat(job.id, workerId, {
      progress: 0.45,
      phase: "encoding",
      message: "Encoding 45%…",
    });
    assert.equal(cancelled, false);

    const current = await store.getJob(job.id);
    assert.equal(current?.progress, 0.45);
    assert.equal(current?.phase, "encoding");
    assert.equal(current?.message, "Encoding 45%…");

    // User cancels the job
    await store.requestCancel(job.id);

    // Next worker heartbeat detects cancellation
    const isCancelled = await store.heartbeat(job.id, workerId);
    assert.equal(isCancelled, true, "Heartbeat must notify worker of cancellation");
  });

  test("immediate cancellation for queued jobs", async () => {
    const store = new MemoryExportJobStore();
    const job = await store.createJob({
      projectId: "proj-cancel-queued",
      userId: "user-1",
      fileName: "cancel.mp4",
      project: dummyProject,
      includeOutro: false,
    });

    const ok = await store.requestCancel(job.id);
    assert.equal(ok, true);

    const current = await store.getJob(job.id);
    assert.equal(current?.status, "cancelled");

    // Worker will never pick up a cancelled job
    const claimed = await store.claimJob("worker-1");
    assert.equal(claimed, null);
  });

  test("recovers stalled jobs if worker crashed mid-export (heartbeat timeout)", async () => {
    const store = new MemoryExportJobStore();
    const job = await store.createJob({
      projectId: "proj-stalled",
      userId: "user-1",
      fileName: "stalled.mp4",
      project: dummyProject,
      includeOutro: true,
    });

    const deadWorker = "worker-dead";
    await store.claimJob(deadWorker);

    // Simulate dead worker by backdating heartbeat past stale threshold
    const jobInStore = await store.getJob(job.id);
    assert.ok(jobInStore);
    jobInStore.heartbeatAt = new Date(Date.now() - 120_000).toISOString(); // 2 minutes ago (stale cutoff is 90s)

    const recoveryWorker = "worker-revived";
    const recovered = await store.claimJob(recoveryWorker, 90);
    assert.ok(recovered, "Stalled job should be re-claimed by recovery worker");
    assert.equal(recovered.id, job.id);
    assert.equal(recovered.workerId, recoveryWorker);
    assert.equal(recovered.attemptCount, 2);
  });

  test("enforces max attempts on crashing jobs to prevent infinite retry storms", async () => {
    const store = new MemoryExportJobStore();
    const job = await store.createJob({
      projectId: "proj-poison",
      userId: "user-1",
      fileName: "poison.mp4",
      project: dummyProject,
      includeOutro: true,
    });

    // First attempt
    await store.claimJob("worker-1");
    const jobInStore = await store.getJob(job.id);
    assert.ok(jobInStore);
    jobInStore.heartbeatAt = new Date(Date.now() - 120_000).toISOString();

    // Second attempt
    await store.claimJob("worker-2", 90);
    jobInStore.heartbeatAt = new Date(Date.now() - 120_000).toISOString();

    // Third attempt should NOT be claimed because maxAttempts = 2
    const thirdClaim = await store.claimJob("worker-3", 90);
    assert.equal(thirdClaim, null, "Should not claim job exceeding maxAttempts");
  });

  test("settles jobs on completion and failure paths", async () => {
    const store = new MemoryExportJobStore();
    const job1 = await store.createJob({
      projectId: "proj-success",
      userId: "user-1",
      fileName: "success.mp4",
      project: dummyProject,
      includeOutro: false,
    });
    await store.claimJob("worker-1");
    await store.complete(job1.id, "worker-1", { outputPath: "/data/.vcut/success.mp4" });

    const finished = await store.getJob(job1.id);
    assert.equal(finished?.status, "completed");
    assert.equal(finished?.progress, 1.0);
    assert.equal(finished?.outputPath, "/data/.vcut/success.mp4");
    assert.ok(finished?.completedAt);

    const job2 = await store.createJob({
      projectId: "proj-fail",
      userId: "user-2",
      fileName: "fail.mp4",
      project: dummyProject,
      includeOutro: false,
    });
    await store.claimJob("worker-2");
    await store.fail(job2.id, "worker-2", "FFmpeg process OOM killed");

    const failed = await store.getJob(job2.id);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.errorMessage, "FFmpeg process OOM killed");
    assert.ok(failed?.completedAt);
  });
});
