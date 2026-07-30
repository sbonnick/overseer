import { errorMessage, json } from "./server-http.ts";
import { applyUpdate, getUpdateImageRef, refreshProject } from "./server-operations.ts";
import type { ServerContext } from "./server-routes.ts";

export async function handleMutationRequest(
  request: Request,
  url: URL,
  context: ServerContext,
): Promise<Response | undefined> {
  const updateMatch = url.pathname.match(/^\/api\/services\/([^/]+)\/update$/);
  if (updateMatch && request.method === "POST") {
    return updateService(updateMatch[1] ?? "", context);
  }

  const restartMatch = url.pathname.match(/^\/api\/services\/([^/]+)\/restart$/);
  if (restartMatch && request.method === "POST") {
    return restartService(restartMatch[1] ?? "", context);
  }

  const operationMatch = url.pathname.match(/^\/api\/update-operations\/([^/]+)$/);
  if (operationMatch && request.method === "GET") {
    return updateOperation(operationMatch[1] ?? "", context);
  }

  const refreshMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/refresh$/);
  if (refreshMatch && request.method === "POST") {
    return refreshComposeProject(refreshMatch[1] ?? "", context);
  }
}

async function updateService(encodedId: string, context: ServerContext): Promise<Response> {
  if (!encodedId) return json({ error: "Invalid container ID" }, 400);
  if (context.state.dockerMutationActive) return mutationConflict();

  context.state.dockerMutationActive = true;
  try {
    const containerId = decodeURIComponent(encodedId);
    const imageRef = await getUpdateImageRef(context.docker, containerId);
    const operationId = crypto.randomUUID();
    context.state.updateOperations ??= new Map();
    const operations = context.state.updateOperations;
    if (operations.size >= 100) operations.delete(operations.keys().next().value ?? "");
    operations.set(operationId, { status: "running" });
    context.updates.markUpdating(imageRef, containerId);
    void runServiceUpdate(context, operationId, containerId, imageRef);
    return json({ ok: true, action: "updating", containerId, operationId }, 202);
  } catch (error) {
    context.state.dockerMutationActive = false;
    return json({ error: errorMessage(error, "Unknown error") }, 500);
  }
}

async function restartService(encodedId: string, context: ServerContext): Promise<Response> {
  if (!encodedId) return json({ error: "Invalid container ID" }, 400);
  if (context.state.dockerMutationActive) return mutationConflict();

  context.state.dockerMutationActive = true;
  try {
    const containerId = decodeURIComponent(encodedId);
    await context.docker.restartContainer(containerId);
    return json({ ok: true, action: "restarted", containerId });
  } catch (error) {
    return json({ error: errorMessage(error, "Unable to restart container") }, 500);
  } finally {
    context.state.dockerMutationActive = false;
  }
}

async function runServiceUpdate(
  context: ServerContext,
  operationId: string,
  containerId: string,
  imageRef: string,
): Promise<void> {
  let deferredMutation = false;
  try {
    const result = await applyUpdate(context.docker, context.updates, containerId);
    context.state.updateOperations?.set(operationId, { status: "succeeded", result });
    const deferredId = result.retireContainerId ?? result.restartContainerId;
    if (deferredId) {
      deferredMutation = true;
      scheduleSelfMutation(context, deferredId, Boolean(result.retireContainerId), imageRef);
    }
  } catch (error) {
    context.state.updateOperations?.set(operationId, {
      status: "failed",
      error: errorMessage(error, "Unknown container update error"),
    });
    context.updates.failUpdating(imageRef, error);
    console.error(`[updates] failed to update ${imageRef}:`, error);
  } finally {
    if (!deferredMutation) {
      context.updates.finishUpdating(imageRef);
      context.state.dockerMutationActive = false;
    }
  }
}

function updateOperation(encodedId: string, context: ServerContext): Response {
  const operation = context.state.updateOperations?.get(decodeURIComponent(encodedId));
  return operation ? json(operation) : json({ error: "Update operation not found" }, 404);
}

function scheduleSelfMutation(
  context: ServerContext,
  containerId: string,
  remove: boolean,
  imageRef: string,
): void {
  setTimeout(() => {
    const operation = remove
      ? context.docker.removeContainer(containerId, { force: true })
      : context.docker.restartContainer(containerId);
    operation
      .catch((error) => {
        const action = remove ? "remove replaced" : "restart";
        console.error(`[updates] failed to ${action} Overseer container:`, error);
      })
      .finally(() => {
        context.updates.finishUpdating(imageRef);
        context.state.dockerMutationActive = false;
      });
  }, 250);
}

async function refreshComposeProject(
  encodedName: string,
  context: ServerContext,
): Promise<Response> {
  if (!encodedName) return json({ error: "Invalid project name" }, 400);
  if (context.state.dockerMutationActive) return mutationConflict();

  context.state.dockerMutationActive = true;
  try {
    return json(await refreshProject(context.docker, decodeURIComponent(encodedName)));
  } catch (error) {
    return json({ error: errorMessage(error, "Unknown error") }, 500);
  } finally {
    context.state.dockerMutationActive = false;
  }
}

function mutationConflict(): Response {
  return json({ error: "Another container operation is already in progress" }, 409);
}
