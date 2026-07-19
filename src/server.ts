import { loadConfig } from "./config.ts";
import { DockerClient } from "./docker.ts";
import { handleRequest, type ServerContext } from "./server-routes.ts";
import { UpdateChecker } from "./updates.ts";

export function startServer(): void {
  const config = loadConfig();
  const docker = new DockerClient(config.docker);
  const updates = new UpdateChecker(docker, config.updateCheckIntervalMs);
  const context: ServerContext = {
    config,
    docker,
    updates,
    state: { dockerMutationActive: false },
  };

  updates.start();
  Bun.serve({ port: config.port, fetch: (request) => handleRequest(request, context) });
}
