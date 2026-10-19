import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVCutIntegration, vcutProjectUrl, isVCutLaunchUrl } from "../src/vcut.ts";

test("default hosted launch does not disclose a BP project", () => {
  const integration = resolveVCutIntegration();
  assert.equal(integration.mode, "external");
  assert.equal(vcutProjectUrl(integration, "private-id", "Private title"), "https://vcut.io");
});

test("explicit loopback editors receive an encoded local project handoff", () => {
  for (const url of ["http://localhost:3002", "http://127.0.0.1:4321", "http://[::1]:3002"]) {
    const integration = resolveVCutIntegration(url + "/");
    assert.equal(integration.mode, "local");
    const target = new URL(vcutProjectUrl(integration, "id/&", "Title & name"));
    assert.equal(target.pathname, "/edit");
    assert.equal(target.searchParams.get("projectId"), "id/&");
    assert.equal(target.searchParams.get("projectName"), "Title & name");
  }
});

test("unsafe or ambiguous configuration falls back without echoing secrets", () => {
  for (const url of ["javascript:alert(1)", "file:///C:/secret", "http://example.com", "https://user:password@example.com", "https://vcut.io?token=secret", "https://vcut.io#secret", "not a URL"]) {
    assert.deepEqual(resolveVCutIntegration(url), {
      url: "https://vcut.io", mode: "external", invalidConfiguration: true,
    });
  }
});

test("configured HTTPS deployment stays external and receives no project metadata", () => {
  const integration = resolveVCutIntegration("https://editor.example.com/app/");
  assert.equal(integration.mode, "external");
  assert.equal(vcutProjectUrl(integration, "id", "title"), "https://editor.example.com/app");
});

test("desktop guest can launch only its editor and online fallback", () => {
  const local = "http://127.0.0.1:3002";
  assert.equal(isVCutLaunchUrl(vcutProjectUrl(resolveVCutIntegration(local), "id", "title"), local), true);
  assert.equal(isVCutLaunchUrl("https://vcut.io/", local), true);
  for (const url of ["https://example.com", "javascript:alert(1)", "file:///C:/secret", "https://vcut.io?projectName=private", "http://127.0.0.1:3002/admin", "http://127.0.0.1:3002/edit?redirect=https://example.com", "http://127.0.0.1:3003/edit"]) {
    assert.equal(isVCutLaunchUrl(url, local), false, url);
  }
});
