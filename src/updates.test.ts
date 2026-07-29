import { describe, expect, test } from "bun:test";
import type { DockerClient } from "./docker.ts";
import { UpdateChecker } from "./updates.ts";

describe("UpdateChecker operation state", () => {
  test("keeps an update visible until it explicitly finishes", () => {
    const updates = new UpdateChecker({} as DockerClient, 1000);

    expect(updates.getStatus("example/app:latest", "container-1")).toBeUndefined();

    updates.markUpdating("example/app:latest", "container-1");
    expect(updates.getStatus("example/app:latest", "container-1")).toMatchObject({
      hasUpdate: false,
      updating: true,
    });
    expect(updates.hasActiveUpdate()).toBe(true);

    updates.finishUpdating("example/app:latest");
    expect(updates.hasActiveUpdate()).toBe(false);
  });

  test("retains a background update failure for the UI", () => {
    const updates = new UpdateChecker({} as DockerClient, 1000);
    updates.markUpdating("example/app:latest", "container-1");
    updates.failUpdating("example/app:latest", new Error("pull failed"));

    const status = updates.getStatus("example/app:latest", "container-1");
    expect(status?.updating).toBeUndefined();
    expect(status?.updateError).toBe("pull failed");

    updates.markUpdating("example/app:latest", "container-1");
    expect(updates.getStatus("example/app:latest", "container-1")?.updateError).toBeUndefined();
  });
});
