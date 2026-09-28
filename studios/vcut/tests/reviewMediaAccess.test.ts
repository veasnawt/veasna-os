import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "@veasnawt/vcut/src/project/types";
import { canReadReviewMedia } from "../app/api/vcut/_lib/reviewMedia.ts";

const project = {
  assets: [
    { relPath: "private-video.mp4", thumbnailRelPath: "private-thumb.jpg", libraryMediaId: null },
    { relPath: "owner-library.mp4", thumbnailRelPath: "owner-library.jpg", libraryMediaId: "media-id" },
  ],
  luts: [{ relPath: "grade.cube" }], customFonts: [{ relPath: "title.ttf" }], customSfx: [],
} as unknown as Project;

test("reviewers see only referenced project and owner-library files", () => {
  assert.equal(canReadReviewMedia(project, "media", "private-video.mp4", false), true);
  assert.equal(canReadReviewMedia(project, "thumbnail", "private-thumb.jpg", false), true);
  assert.equal(canReadReviewMedia(project, "media", "owner-library.mp4", true), true);
  assert.equal(canReadReviewMedia(project, "media", "owner-library.mp4", false), false);
  assert.equal(canReadReviewMedia(project, "media", "unrelated-library.mp4", true), false);
  assert.equal(canReadReviewMedia(project, "export", "private-export.mp4", false), false);
  assert.equal(canReadReviewMedia(project, "lut", "grade.cube", false), true);
  assert.equal(canReadReviewMedia(project, "customFont", "title.ttf", true), false);
});
