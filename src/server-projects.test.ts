import { describe, expect, test } from "bun:test";
import type { DockerClient, DockerContainer } from "./docker.ts";
import { getProjectsResponse } from "./server-projects.ts";
import type { ServerContext } from "./server-routes.ts";
import { UpdateChecker } from "./updates.ts";

describe("project polling during updates", () => {
  test("returns cached updating projects when Docker is temporarily unavailable", async () => {
    const imageRef = "example/app:latest";
    const container: DockerContainer = {
      Id: "container-1",
      Names: ["/app"],
      Image: imageRef,
      ImageID: "sha256:old",
      Command: "",
      Created: 0,
      State: "running",
      Status: "Up",
      Labels: {
        "com.docker.compose.project": "example",
        "com.docker.compose.service": "app",
        "com.docker.compose.image": imageRef,
      },
    };
    let available = true;
    const docker = {
      listContainers: async () => {
        if (!available) throw new Error("Docker proxy unavailable");
        return [container];
      },
    } as unknown as DockerClient;
    const updates = new UpdateChecker(docker, 1000);
    updates.markUpdating(imageRef, container.Id);
    const context = {
      config: { composeFilesDir: "/tmp", pollIntervalMs: 5000, docker: { kind: "socket" } },
      docker,
      updates,
      state: { dockerMutationActive: true, composePathMappings: Promise.resolve([]) },
    } as unknown as ServerContext;

    expect((await getProjectsResponse(context)).status).toBe(200);
    available = false;

    const response = await getProjectsResponse(context);
    const body = (await response.json()) as {
      stale: boolean;
      updating: boolean;
      projects: Array<{ services: Array<{ update: { updating: boolean } }> }>;
    };
    expect(response.status).toBe(200);
    expect(body.stale).toBe(true);
    expect(body.updating).toBe(true);
    expect(body.projects[0].services[0].update.updating).toBe(true);
  });
});
