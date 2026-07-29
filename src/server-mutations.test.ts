import { describe, expect, test } from "bun:test";
import type { DockerClient, DockerContainerInspect } from "./docker.ts";
import { handleMutationRequest } from "./server-mutations.ts";
import type { ServerContext } from "./server-routes.ts";
import { UpdateChecker } from "./updates.ts";

describe("container updates", () => {
  test("acknowledges before a long image pull completes", async () => {
    let releasePull: (() => void) | undefined;
    const pullBlocked = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const imageRef = `example/app@sha256:${"a".repeat(64)}`;
    const container: DockerContainerInspect = {
      Id: "container-1",
      Name: "/app",
      Image: "sha256:old",
      Config: { Image: imageRef, Labels: {} },
      HostConfig: {},
    };
    const docker = {
      inspectContainer: async () => container,
      pullImage: async () => pullBlocked,
      inspectImage: async () => ({ Id: container.Image, RepoDigests: [] }),
      restartContainer: async () => undefined,
    } as unknown as DockerClient;
    const updates = new UpdateChecker(docker, 1000);
    const context = {
      docker,
      updates,
      state: { dockerMutationActive: false },
    } as ServerContext;
    const request = new Request("http://localhost/api/services/container-1/update", {
      method: "POST",
    });

    const response = await handleMutationRequest(request, new URL(request.url), context);
    const accepted = (await response?.json()) as { operationId: string };

    expect(response?.status).toBe(202);
    expect(accepted.operationId).toBeString();
    expect(context.state.dockerMutationActive).toBe(true);
    expect(updates.getStatus(imageRef, container.Id)?.updating).toBe(true);

    releasePull?.();
    await waitFor(() => !context.state.dockerMutationActive);
    expect(updates.hasActiveUpdate()).toBe(false);

    const statusRequest = new Request(
      `http://localhost/api/update-operations/${accepted.operationId}`,
    );
    const statusResponse = await handleMutationRequest(
      statusRequest,
      new URL(statusRequest.url),
      context,
    );
    expect(statusResponse?.status).toBe(200);
    expect(await statusResponse?.json()).toMatchObject({
      status: "succeeded",
      result: { ok: true, action: "restarted", containerId: container.Id },
    });
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate() && Date.now() < deadline) {
    await Bun.sleep(5);
  }
  expect(predicate()).toBe(true);
}
