import path from "node:path";
import { listComposeFiles, readComposeFile, writeComposeFile } from "./compose-files.ts";
import { loadConfig } from "./config.ts";
import { discoverProjects } from "./discovery.ts";
import { DockerClient } from "./docker.ts";
import { discoverTraefikApiRoutes } from "./traefik.ts";
import { page } from "./ui.ts";
import { isImageId, resolveUpdateImageRef, UpdateChecker } from "./updates.ts";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const svgAssets = new Set([
  "favicon.svg",
  "favicon-16.svg",
  "favicon-32.svg",
  "overseer.svg",
  "overseer-180.svg",
  "overseer-192.svg",
  "overseer-512.svg",
  "overseer-maskable.svg",
]);

export function startServer(): void {
  const config = loadConfig();
  const docker = new DockerClient(config.docker);
  const updates = new UpdateChecker(docker, config.updateCheckIntervalMs);

  updates.start();

  Bun.serve({
    port: config.port,
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/favicon.svg") {
        return svgAsset("favicon.svg");
      }

      const assetName = url.pathname.match(/^\/assets\/([a-z0-9-]+\.svg)$/)?.[1];
      if (assetName && svgAssets.has(assetName)) {
        return svgAsset(assetName);
      }

      if (url.pathname === "/manifest.webmanifest") {
        return new Response(Bun.file("assets/manifest.webmanifest"), {
          headers: {
            "cache-control": "public, max-age=86400",
            "content-type": "application/manifest+json; charset=utf-8",
          },
        });
      }

      if (url.pathname === "/") {
        return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          docker: await checkDocker(docker),
          connection: config.docker.kind,
        });
      }

      if (url.pathname === "/api/projects") {
        try {
          const containers = await docker.listContainers();
          const traefikRoutes = await discoverTraefikApiRoutes(containers);
          const projects = discoverProjects(containers, config.projectFilter, traefikRoutes);
          await resolveServiceImageNames(docker, projects);
          for (const project of projects) {
            for (const service of project.services) {
              service.update = updates.getStatus(service.image);
            }
          }
          return json({
            projects,
            updatedAt: new Date().toISOString(),
            updatesCheckedAt: updates.getLastCheckedAt(),
            pollIntervalMs: config.pollIntervalMs,
          });
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Unknown Docker API error" },
            502,
          );
        }
      }

      if (url.pathname === "/api/compose-files" && request.method === "GET") {
        try {
          return json({
            root: config.composeFilesDir,
            files: await listComposeFiles(config.composeFilesDir),
          });
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Unable to list files" },
            500,
          );
        }
      }

      if (url.pathname === "/api/compose-files/content") {
        const filePath = url.searchParams.get("path") ?? "";
        if (!filePath) {
          return json({ error: "Missing file path" }, 400);
        }

        try {
          if (request.method === "GET") {
            return json({ file: await readComposeFile(config.composeFilesDir, filePath) });
          }

          if (request.method === "PUT") {
            const body = (await request.json()) as { content?: unknown };
            if (typeof body.content !== "string") {
              return json({ error: "Missing file content" }, 400);
            }

            return json({
              file: await writeComposeFile(config.composeFilesDir, filePath, body.content),
            });
          }
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Unable to access file" },
            500,
          );
        }
      }

      const updateMatch = url.pathname.match(/^\/api\/services\/([^/]+)\/update$/);
      if (updateMatch && request.method === "POST") {
        const containerId = updateMatch[1] ?? "";
        if (!containerId) {
          return json({ error: "Invalid container ID" }, 400);
        }
        try {
          const result = await applyUpdate(docker, updates, decodeURIComponent(containerId));
          if (result.retireContainerId) {
            const retireContainerId = result.retireContainerId;
            // Send the success response before removing the process handling this request.
            setTimeout(() => {
              docker.removeContainer(retireContainerId, { force: true }).catch((error) => {
                console.error("[updates] failed to remove replaced Overseer container:", error);
              });
            }, 250);
          }
          if (result.restartContainerId) {
            const restartContainerId = result.restartContainerId;
            setTimeout(() => {
              docker.restartContainer(restartContainerId).catch((error) => {
                console.error("[updates] failed to restart Overseer container:", error);
              });
            }, 250);
          }
          return json(result);
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
        }
      }

      const refreshMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/refresh$/);
      if (refreshMatch && request.method === "POST") {
        const projectName = refreshMatch[1] ?? "";
        if (!projectName) {
          return json({ error: "Invalid project name" }, 400);
        }
        try {
          const result = await refreshProject(docker, decodeURIComponent(projectName));
          return json(result);
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
        }
      }

      return json({ error: "Not found" }, 404);
    },
  });

  console.log(`overseer listening on http://0.0.0.0:${config.port}`);
}

async function resolveServiceImageNames(
  docker: DockerClient,
  projects: ReturnType<typeof discoverProjects>,
): Promise<void> {
  const services = projects
    .flatMap((project) => project.services)
    .filter((service) => isImageId(service.image) || service.image.includes("sha256:"));
  await Promise.all(
    services.map(async (service) => {
      try {
        const imageInfo = await docker.inspectImage(service.image);
        service.image = resolveReadableImageRef(service.image, imageInfo.RepoTags) ?? service.image;
      } catch {
        // Keep the Docker-provided image ID if it cannot be resolved to a repo tag.
      }
    }),
  );
}

async function applyUpdate(
  docker: DockerClient,
  updates: UpdateChecker,
  containerId: string,
): Promise<{
  ok: true;
  action: string;
  containerId: string;
  retireContainerId?: string;
  restartContainerId?: string;
}> {
  const container = await docker.inspectContainer(containerId);
  const isSelf = isCurrentContainer(container);
  let imageRef = container.Config.Image;

  if (imageRef.startsWith("sha256:")) {
    const imageInfo = await docker.inspectImage(container.Image);
    const tag = imageInfo.RepoTags?.find((t) => !t.includes("<none>"));
    if (!tag) throw new Error("Cannot update: image has no tag reference");
    imageRef = tag;
  }

  await docker.pullImage(imageRef);
  const newImage = await docker.inspectImage(imageRef);

  if (newImage.Id !== container.Image) {
    const containerName = container.Name.replace(/^\//, "");
    const networks = container.NetworkSettings?.Networks ?? {};
    const labels = {
      ...(container.Config.Labels ?? {}),
      "com.docker.compose.image": imageRef,
      ...(isSelf ? { "io.sbonnick.overseer.self": "true" } : {}),
    };

    const createConfig = {
      ...container.Config,
      Image: imageRef,
      Labels: labels,
      HostConfig: container.HostConfig,
      NetworkingConfig: {
        EndpointsConfig: Object.fromEntries(
          Object.entries(networks).map(([name, net]) => [
            name,
            { Aliases: net.Aliases, Links: net.Links },
          ]),
        ),
      },
    };

    if (isSelf) {
      const replacementName = `${containerName}-replaced-${Date.now()}`;
      await docker.renameContainer(containerId, replacementName);
      try {
        const created = await docker.createContainer(containerName, createConfig);
        await docker.startContainer(created.Id);
        await updates.invalidate(imageRef);

        return {
          ok: true,
          action: "recreated",
          containerId: created.Id,
          retireContainerId: containerId,
        };
      } catch (error) {
        await docker.renameContainer(containerId, containerName).catch(() => {});
        throw error;
      }
    }

    await docker.stopContainer(containerId);
    await docker.removeContainer(containerId, { force: true });
    const created = await docker.createContainer(containerName, createConfig);
    await docker.startContainer(created.Id);
    await updates.invalidate(imageRef);

    return { ok: true, action: "recreated", containerId: created.Id };
  }

  if (isSelf) {
    await updates.invalidate(imageRef);
    return { ok: true, action: "restarted", containerId, restartContainerId: containerId };
  }

  await docker.restartContainer(containerId);
  await updates.invalidate(imageRef);

  return { ok: true, action: "restarted", containerId };
}

function resolveReadableImageRef(imageRef: string, repoTags: string[] | undefined): string | null {
  if (isImageId(imageRef)) return resolveUpdateImageRef(imageRef, repoTags);
  if (imageRef.includes("sha256:")) return repoTags?.find((tag) => !tag.includes("<none>")) ?? null;
  return imageRef;
}

function isCurrentContainer(
  container: Awaited<ReturnType<DockerClient["inspectContainer"]>>,
): boolean {
  const hostname = Bun.env.HOSTNAME;
  return (
    container.Config.Labels?.["io.sbonnick.overseer.self"] === "true" ||
    (hostname !== undefined && hostname.length > 0 && container.Id.startsWith(hostname))
  );
}

async function refreshProject(
  docker: DockerClient,
  projectName: string,
): Promise<{ ok: true; action: string; logs: string }> {
  const containers = await docker.listContainers();
  const projectContainer = containers.find(
    (container) => container.Labels?.["com.docker.compose.project"] === projectName,
  );
  if (!projectContainer) {
    throw new Error(`Cannot refresh: compose project ${projectName} was not found`);
  }

  const labels = projectContainer.Labels ?? {};
  const workingDir = labels["com.docker.compose.project.working_dir"];
  if (!workingDir) {
    throw new Error("Cannot refresh: compose working directory label is missing");
  }

  const composeArgs = buildComposeFileArgs(
    workingDir,
    splitConfigFiles(labels["com.docker.compose.project.config_files"]),
  );
  const helperImage = "docker:27-cli";
  await docker.pullImage(helperImage);

  const helperName = `overseer-compose-refresh-${sanitizeName(projectName)}-${Date.now()}`;
  const socketBind =
    docker.connection.kind === "socket"
      ? [`${docker.connection.socketPath}:/var/run/docker.sock`]
      : [];
  const networkMode =
    docker.connection.kind === "http"
      ? currentContainerNetwork(containers, hostname(docker.connection.baseUrl))
      : undefined;
  const dockerHost =
    docker.connection.kind === "socket"
      ? "unix:///var/run/docker.sock"
      : docker.connection.baseUrl.replace(/^http:\/\//, "tcp://");
  const created = await docker.createContainer(helperName, {
    Image: helperImage,
    Tty: true,
    WorkingDir: workingDir,
    Env: [`DOCKER_HOST=${dockerHost}`],
    Cmd: ["compose", "-p", projectName, ...composeArgs, "up", "-d"],
    HostConfig: {
      Binds: [`${workingDir}:${workingDir}`, ...socketBind],
      ...(networkMode ? { NetworkMode: networkMode } : {}),
    },
  });

  await docker.startContainer(created.Id);
  const wait = await docker.waitContainer(created.Id);
  const logs = (await docker.containerLogs(created.Id)).trim();
  if (wait.StatusCode !== 0) {
    throw new Error(
      [
        `Compose refresh failed with status ${wait.StatusCode}. Helper container kept: ${helperName}`,
        logs || wait.Error?.Message,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  await docker.removeContainer(created.Id, { force: true }).catch(() => undefined);
  return { ok: true, action: "refreshed", logs };
}

function buildComposeFileArgs(workingDir: string, configFiles: string[]): string[] {
  return configFiles.flatMap((file) => {
    const relative = path.isAbsolute(file) ? path.relative(workingDir, file) : file;
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Cannot refresh: compose file ${file} is outside ${workingDir}`);
    }
    return ["-f", path.join(workingDir, relative)];
  });
}

function splitConfigFiles(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((file) => file.trim())
      .filter(Boolean) ?? []
  );
}

function sanitizeName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function currentContainerNetwork(
  containers: Awaited<ReturnType<DockerClient["listContainers"]>>,
  proxyHost?: string,
): string | undefined {
  const hostname = Bun.env.HOSTNAME;
  const current = containers.find(
    (container) =>
      container.Labels?.["io.sbonnick.overseer.self"] === "true" ||
      (hostname !== undefined && hostname.length > 0 && container.Id.startsWith(hostname)),
  );
  const currentNetwork = Object.keys(current?.NetworkSettings?.Networks ?? {})[0];
  if (currentNetwork) {
    return currentNetwork;
  }

  if (!proxyHost) {
    return undefined;
  }

  const proxy = containers.find((container) => {
    const service = container.Labels?.["com.docker.compose.service"];
    const names = container.Names?.map((name) => name.replace(/^\//, "")) ?? [];
    return (
      service === proxyHost ||
      names.includes(proxyHost) ||
      names.some((name) => name.includes(proxyHost))
    );
  });
  return Object.keys(proxy?.NetworkSettings?.Networks ?? {})[0];
}

function hostname(value: string): string | undefined {
  try {
    return new URL(value).hostname || undefined;
  } catch {
    return undefined;
  }
}

async function checkDocker(docker: DockerClient): Promise<boolean> {
  try {
    return await docker.ping();
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function svgAsset(fileName: string): Response {
  return new Response(Bun.file(`assets/${fileName}`), {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
}
