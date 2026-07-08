import { listComposeFiles, readComposeFile, writeComposeFile } from "./compose-files.ts";
import { loadConfig } from "./config.ts";
import { discoverProjects } from "./discovery.ts";
import { DockerClient } from "./docker.ts";
import { discoverTraefikApiRoutes } from "./traefik.ts";
import { page } from "./ui.ts";
import { UpdateChecker } from "./updates.ts";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export function startServer(): void {
  const config = loadConfig();
  const docker = new DockerClient(config.docker);
  const updates = new UpdateChecker(docker, config.updateCheckIntervalMs);

  updates.start();

  Bun.serve({
    port: config.port,
    async fetch(request) {
      const url = new URL(request.url);

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
          for (const project of projects) {
            for (const service of project.services) {
              service.update = updates.getStatus(service.image);
            }
          }
          return json({
            projects,
            updatedAt: new Date().toISOString(),
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

async function applyUpdate(
  docker: DockerClient,
  updates: UpdateChecker,
  containerId: string,
): Promise<{ ok: true; action: string; containerId: string }> {
  const container = await docker.inspectContainer(containerId);
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

    const createConfig = {
      ...container.Config,
      Image: imageRef,
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

    await docker.stopContainer(containerId);
    await docker.removeContainer(containerId, { force: true });
    const created = await docker.createContainer(containerName, createConfig);
    await docker.startContainer(created.Id);
    await updates.invalidate(imageRef);

    return { ok: true, action: "recreated", containerId: created.Id };
  }

  await docker.restartContainer(containerId);
  await updates.invalidate(imageRef);

  return { ok: true, action: "restarted", containerId };
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
