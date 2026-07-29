import { describe, expect, test } from "bun:test";
import type { DockerClient } from "./docker.ts";
import { imageVersion } from "./registry.ts";
import { UpdateChecker } from "./updates.ts";

describe("imageVersion", () => {
  test("prefers the OCI version label", () => {
    expect(
      imageVersion({
        "org.opencontainers.image.version": "2.4.0",
        "org.label-schema.version": "2.3.0",
      }),
    ).toBe("2.4.0");
  });

  test("supports the legacy label", () => {
    expect(imageVersion({ "org.label-schema.version": "2.3.0" })).toBe("2.3.0");
  });
});

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
