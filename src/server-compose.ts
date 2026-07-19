import { listComposeFiles, readComposeFile, writeComposeFile } from "./compose-files.ts";
import { findComposeServiceOffset } from "./compose-location.ts";
import { errorMessage, errorStatus, json, readLimitedJson } from "./server-http.ts";
import type { ServerContext } from "./server-routes.ts";

export async function handleComposeRequest(
  request: Request,
  url: URL,
  context: ServerContext,
): Promise<Response | undefined> {
  if (url.pathname === "/api/compose-files" && request.method === "GET") {
    return listFiles(context);
  }
  if (url.pathname === "/api/compose-files/content") {
    return fileContent(request, url, context);
  }
  if (url.pathname === "/api/compose-files/locate" && request.method === "POST") {
    return locateService(request);
  }
  if (url.pathname === "/api/compose-files/service-content" && request.method === "POST") {
    return serviceContent(request, context);
  }
}

async function listFiles(context: ServerContext): Promise<Response> {
  try {
    return json({
      root: context.config.composeFilesDir,
      files: await listComposeFiles(context.config.composeFilesDir),
    });
  } catch (error) {
    return json({ error: errorMessage(error, "Unable to list files") }, 500);
  }
}

async function fileContent(
  request: Request,
  url: URL,
  context: ServerContext,
): Promise<Response | undefined> {
  const filePath = url.searchParams.get("path") ?? "";
  if (!filePath) return json({ error: "Missing file path" }, 400);

  try {
    if (request.method === "GET") return await readFileResponse(url, context, filePath);
    if (request.method === "PUT") return await writeFileResponse(request, context, filePath);
  } catch (error) {
    return json({ error: errorMessage(error, "Unable to access file") }, 500);
  }
}

async function readFileResponse(
  url: URL,
  context: ServerContext,
  filePath: string,
): Promise<Response> {
  const file = await readComposeFile(context.config.composeFilesDir, filePath);
  const serviceName = url.searchParams.get("service") ?? "";
  return json({
    file: {
      ...file,
      serviceOffset: findComposeServiceOffset(file.content, file.path, serviceName),
    },
  });
}

async function writeFileResponse(
  request: Request,
  context: ServerContext,
  filePath: string,
): Promise<Response> {
  const body = (await request.json()) as { content?: unknown };
  if (typeof body.content !== "string") return json({ error: "Missing file content" }, 400);
  return json({
    file: await writeComposeFile(context.config.composeFilesDir, filePath, body.content),
  });
}

async function locateService(request: Request): Promise<Response> {
  let body: { content?: unknown; path?: unknown; service?: unknown };
  try {
    body = (await readLimitedJson(request, 8 * 1024 * 1024)) as typeof body;
  } catch (error) {
    return json({ error: errorMessage(error, "Invalid request body") }, errorStatus(error));
  }
  if (!validLocateBody(body)) {
    return json({ error: "Invalid Compose content or service" }, 400);
  }
  return json({ offset: findComposeServiceOffset(body.content, body.path, body.service) });
}

function validLocateBody(body: {
  content?: unknown;
  path?: unknown;
  service?: unknown;
}): body is { content: string; path: string; service: string } {
  return (
    typeof body.content === "string" &&
    typeof body.path === "string" &&
    typeof body.service === "string" &&
    new TextEncoder().encode(body.content).byteLength <= 1024 * 1024 &&
    body.path.length <= 4096 &&
    body.service.length <= 256
  );
}

async function serviceContent(request: Request, context: ServerContext): Promise<Response> {
  let body: { paths?: unknown; service?: unknown };
  try {
    body = (await readLimitedJson(request, 256 * 1024)) as typeof body;
  } catch (error) {
    return json({ error: errorMessage(error, "Invalid request body") }, errorStatus(error));
  }
  if (!validServiceBody(body)) {
    return json({ error: "Invalid Compose file paths or service" }, 400);
  }
  try {
    return await findServiceFile(context.config.composeFilesDir, body.paths, body.service);
  } catch (error) {
    return json({ error: errorMessage(error, "Unable to access Compose files") }, 500);
  }
}

function validServiceBody(body: {
  paths?: unknown;
  service?: unknown;
}): body is { paths: string[]; service: string } {
  return (
    Array.isArray(body.paths) &&
    body.paths.length > 0 &&
    body.paths.length <= 32 &&
    body.paths.every((filePath) => typeof filePath === "string" && filePath.length <= 4096) &&
    typeof body.service === "string" &&
    body.service.length <= 256
  );
}

async function findServiceFile(root: string, paths: string[], service: string): Promise<Response> {
  let firstFile: Awaited<ReturnType<typeof readComposeFile>> | undefined;
  for (const filePath of paths) {
    const file = await readComposeFile(root, filePath);
    firstFile ??= file;
    const serviceOffset = findComposeServiceOffset(file.content, file.path, service);
    if (serviceOffset !== undefined) return json({ file: { ...file, serviceOffset } });
  }
  return json({ file: firstFile });
}
