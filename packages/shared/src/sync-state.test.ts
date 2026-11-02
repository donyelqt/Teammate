import { describe, expect, it } from "vitest";

import { syncBadge, type SyncState } from "./sync-state.js";

const synced: SyncState = { kind: "synced" };
const pending: SyncState = { kind: "pending", queued: 3 };
const offline: SyncState = {
  kind: "offline",
  queued: 7,
  since: "2026-11-02T00:00:00.000Z",
};
const conflict: SyncState = {
  kind: "conflict",
  local: { title: "mine" },
  remote: { title: "theirs" },
};

describe("syncBadge", () => {
  it("shows nothing when the queue is empty and the session is live", () => {
    expect(syncBadge(synced)).toBeNull();
  });

  it("counts queued edits while they are being sent", () => {
    expect(syncBadge(pending)).toBe("Saving 3");
  });

  it("reports the outage and the backlog together", () => {
    expect(syncBadge(offline)).toBe("Offline, 7 queued");
  });

  it("names the conflict without picking a side", () => {
    expect(syncBadge(conflict)).toBe("Conflict");
  });
});
