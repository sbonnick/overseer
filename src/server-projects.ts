import path from "node:path";
import { type ComposePathMapping, resolveComposeEditorFiles } from "./compose-files.ts";
import { discoverProjects, type ProjectInfo } from "./discovery.ts";
import type { DockerClient, DockerContainer } from "./docker.ts";
import { errorMessage, json } from "./server-http.ts";
import { dockerProxyProject, isCurrentService, splitConfigFiles } from "./server-operations.ts";
import type { ServerContext } from "./server-routes.ts";
import { discoverTraefikApiRoutes } from "./traefik.ts";
import { isImageId, resolveUpdateImageRef } from "./updates.ts";

export async function getProjectsResponse(context: ServerContext): Promise<Response> {
  try {
    const containers = await context.docker.listContainers();
    const traefikRoutes = await discoverTraefikApiRoutes(containers);
    const projects = discoverProjects(containers, context.config.projectFilter, traefikRoutes);
    disableProxyRefresh(projects, containers, context);
    await resolveServiceImageNames(context.docker, projects);
    await attachAvailableComposeFiles(projects, containers, context);
    attachRuntimeState(projects, context);
    return json({
      projects,
      updatedAt: new Date().toISOString(),
      updatesCheckedAt: context.updates.getLastCheckedAt(),
      pollIntervalMs: context.config.pollIntervalMs,
    });
  } catch (error) {
    return json({ error: errorMessage(error, "Unknown Docker API error") }, 502);
  }
}

function disableProxyRefresh(
  projects: ProjectInfo[],
  containers: DockerContainer[],
  context: ServerContext,
): void {
  const proxyProject = dockerProxyProject(containers, context.config.docker);
  const project = projects.find((item) => item.name === proxyProject);
  if (project) {
    project.refreshDisabledReason =
      "Compose refresh is unavailable because this project contains the Docker proxy Overseer uses.";
  }
}

async function attachAvailableComposeFiles(
  projects: ProjectInfo[],
  containers: DockerContainer[],
  context: ServerContext,
): Promise<void> {
  context.state.composePathMappings ??= resolveComposePathMappings(
    context.docker,
    containers,
    context.config.composeFilesDir,
  );
  const mappings = await context.state.composePathMappings;
  if (!mappings) {
    context.state.composePathMappings = undefined;
    return;
  }
  attachComposeEditorFiles(projects, context.config.composeFilesDir, mappings);
}

function attachRuntimeState(projects: ProjectInfo[], context: ServerContext): void {
  for (const project of projects) {
    for (const service of project.services) {
      service.isSelf = isCurrentService(service.id, service.labels);
      service.update = context.updates.getStatus(service.image, service.id, service.imageId);
    }
  }
}

async function resolveServiceImageNames(
  docker: DockerClient,
  projects: ProjectInfo[],
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

function attachComposeEditorFiles(
  projects: ProjectInfo[],
  editorRoot: string,
  pathMappings: ComposePathMapping[],
): void {
  for (const project of projects) {
    for (const service of project.services) {
      service.composeEditorFiles = resolveComposeEditorFiles(
        editorRoot,
        pathMappings,
        service.labels["com.docker.compose.project.working_dir"],
        splitConfigFiles(service.labels["com.docker.compose.project.config_files"]),
      );
    }
  }
}

async function resolveComposePathMappings(
  docker: DockerClient,
  containers: DockerContainer[],
  editorRoot: string,
): Promise<ComposePathMapping[] | undefined> {
  const directlyMatched = containers.find((container) =>
    isCurrentService(container.Id, container.Labels ?? {}),
  );
  let inspected = directlyMatched
    ? await docker.inspectContainer(directlyMatched.Id).catch(() => undefined)
    : undefined;
  if (!inspected && Bun.env.HOSTNAME) inspected = await inspectByHostname(docker, containers);

  const resolvedEditorRoot = path.resolve(editorRoot);
  const mappings =
    inspected?.Mounts?.flatMap((mount) => {
      if (!isRelevantMount(mount, resolvedEditorRoot)) return [];
      return [{ source: path.resolve(mount.Source), destination: path.resolve(mount.Destination) }];
    }) ?? [];
  return mappings.length
    ? mappings
    : [{ source: resolvedEditorRoot, destination: resolvedEditorRoot }];
}

async function inspectByHostname(docker: DockerClient, containers: DockerContainer[]) {
  const candidates = await Promise.allSettled(
    containers.map((container) => docker.inspectContainer(container.Id)),
  );
  const matched = candidates.find(
    (candidate) =>
      candidate.status === "fulfilled" && candidate.value.Config.Hostname === Bun.env.HOSTNAME,
  );
  if (matched?.status === "fulfilled") return matched.value;
  if (candidates.some((candidate) => candidate.status === "rejected")) return undefined;
}

function isRelevantMount(
  mount: { Type?: string; Source?: string; Destination?: string },
  editorRoot: string,
): mount is { Type?: string; Source: string; Destination: string } {
  return Boolean(
    mount.Type === "bind" &&
      mount.Source &&
      mount.Destination &&
      (isPathInside(mount.Destination, editorRoot) || isPathInside(editorRoot, mount.Destination)),
  );
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveReadableImageRef(imageRef: string, repoTags: string[] | undefined): string | null {
  if (isImageId(imageRef)) return resolveUpdateImageRef(imageRef, repoTags);
  if (imageRef.includes("sha256:")) return repoTags?.find((tag) => !tag.includes("<none>")) ?? null;
  return imageRef;
}
