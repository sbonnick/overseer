import type { ComposePathMapping } from "./compose-files.ts";
import type { AppConfig } from "./config.ts";
import type { DockerClient } from "./docker.ts";
import { handleComposeRequest } from "./server-compose.ts";
import { errorMessage, json, staticResponse } from "./server-http.ts";
import { handleMutationRequest } from "./server-mutations.ts";
import { getProjectsResponse } from "./server-projects.ts";
import { page } from "./ui.ts";
import type { UpdateChecker } from "./updates.ts";

export type ServerContext = {
  config: AppConfig;
  docker: DockerClient;
  updates: UpdateChecker;
  state: {
    dockerMutationActive: boolean;
    composePathMappings?: Promise<ComposePathMapping[] | undefined>;
  };
};

export async function handleRequest(request: Request, context: ServerContext): Promise<Response> {
  const url = new URL(request.url);
  const asset = staticResponse(url);
  if (asset) return asset;

  if (url.pathname === "/") {
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (url.pathname === "/api/health") return healthResponse(context);
  if (url.pathname === "/api/updates/check" && request.method === "POST") {
    return checkUpdatesResponse(context);
  }
  if (url.pathname === "/api/projects") return getProjectsResponse(context);

  const composeResponse = await handleComposeRequest(request, url, context);
  if (composeResponse) return composeResponse;

  const mutationResponse = await handleMutationRequest(request, url, context);
  return mutationResponse ?? json({ error: "Not found" }, 404);
}

async function healthResponse(context: ServerContext): Promise<Response> {
  let dockerAvailable = false;
  try {
    dockerAvailable = await context.docker.ping();
  } catch {
    // Health responses report an unavailable Docker API instead of failing the request.
  }
  return json({
    ok: true,
    docker: dockerAvailable,
    connection: context.config.docker.kind,
  });
}

async function checkUpdatesResponse(context: ServerContext): Promise<Response> {
  try {
    await context.updates.checkAll();
    return json({ updatesCheckedAt: context.updates.getLastCheckedAt() });
  } catch (error) {
    return json({ error: errorMessage(error, "Unable to check for updates") }, 502);
  }
}
