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

  const refreshMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/refresh$/);
  if (refreshMatch && request.method === "POST") {
    return refreshComposeProject(refreshMatch[1] ?? "", context);
  }
}

async function updateService(encodedId: string, context: ServerContext): Promise<Response> {
  if (!encodedId) return json({ error: "Invalid container ID" }, 400);
  if (context.state.dockerMutationActive) return mutationConflict();

  context.state.dockerMutationActive = true;
  let deferredMutation = false;
  let imageRef: string | undefined;
  try {
    const containerId = decodeURIComponent(encodedId);
    imageRef = await getUpdateImageRef(context.docker, containerId);
    context.updates.markUpdating(imageRef, containerId);
    const result = await applyUpdate(context.docker, context.updates, containerId);
    const deferredId = result.retireContainerId ?? result.restartContainerId;
    if (deferredId) {
      deferredMutation = true;
      scheduleSelfMutation(context, deferredId, Boolean(result.retireContainerId));
    }
    return json(result);
  } catch (error) {
    if (imageRef) context.updates.clearUpdating(imageRef);
    return json({ error: errorMessage(error, "Unknown error") }, 500);
  } finally {
    if (!deferredMutation) context.state.dockerMutationActive = false;
  }
}

function scheduleSelfMutation(context: ServerContext, containerId: string, remove: boolean): void {
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
