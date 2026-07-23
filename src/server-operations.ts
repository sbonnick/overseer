import path from "node:path";
import type { DockerConnection } from "./config.ts";
import type { DockerClient, DockerContainer, DockerContainerInspect } from "./docker.ts";
import type { UpdateChecker } from "./updates.ts";

type UpdateResult = {
  ok: true;
  action: string;
  containerId: string;
  retireContainerId?: string;
  restartContainerId?: string;
};

export async function applyUpdate(
  docker: DockerClient,
  updates: UpdateChecker,
  containerId: string,
): Promise<UpdateResult> {
  const container = await docker.inspectContainer(containerId);
  const isSelf = isCurrentContainer(container);
  const imageRef = await taggedImageRef(docker, container);
  await docker.pullImage(imageRef);
  const newImage = await docker.inspectImage(imageRef);

  if (newImage.Id !== container.Image) {
    return recreateContainer(docker, updates, container, imageRef, isSelf);
  }

  if (isSelf) {
    await updates.invalidate(imageRef);
    return { ok: true, action: "restarted", containerId, restartContainerId: containerId };
  }
  await docker.restartContainer(containerId);
  await updates.invalidate(imageRef);
  return { ok: true, action: "restarted", containerId };
}

async function recreateContainer(
  docker: DockerClient,
  updates: UpdateChecker,
  container: DockerContainerInspect,
  imageRef: string,
  isSelf: boolean,
): Promise<UpdateResult> {
  const containerName = container.Name.replace(/^\//, "");
  const createConfig = replacementConfig(container, imageRef, isSelf);
  if (isSelf) {
    return recreateSelf(docker, updates, container, containerName, createConfig, imageRef);
  }

  await docker.stopContainer(container.Id);
  await docker.removeContainer(container.Id, { force: true });
  const created = await docker.createContainer(containerName, createConfig);
  await docker.startContainer(created.Id);
  await updates.invalidate(imageRef);
  return { ok: true, action: "recreated", containerId: created.Id };
}

async function recreateSelf(
  docker: DockerClient,
  updates: UpdateChecker,
  container: DockerContainerInspect,
  containerName: string,
  createConfig: unknown,
  imageRef: string,
): Promise<UpdateResult> {
  await docker.renameContainer(container.Id, `${containerName}-replaced-${Date.now()}`);
  try {
    const created = await docker.createContainer(containerName, createConfig);
    await docker.startContainer(created.Id);
    await updates.invalidate(imageRef);
    return {
      ok: true,
      action: "recreated",
      containerId: created.Id,
      retireContainerId: container.Id,
    };
  } catch (error) {
    await docker.renameContainer(container.Id, containerName).catch(() => {});
    throw error;
  }
}

function replacementConfig(container: DockerContainerInspect, imageRef: string, isSelf: boolean) {
  const networks = container.NetworkSettings?.Networks ?? {};
  return {
    ...container.Config,
    Image: imageRef,
    Labels: {
      ...container.Config.Labels,
      "com.docker.compose.image": imageRef,
      ...(isSelf ? { "io.sbonnick.overseer.self": "true" } : {}),
    },
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
}

async function taggedImageRef(
  docker: DockerClient,
  container: DockerContainerInspect,
): Promise<string> {
  if (!container.Config.Image.startsWith("sha256:")) return container.Config.Image;
  const imageInfo = await docker.inspectImage(container.Image);
  const tag = imageInfo.RepoTags?.find((value) => !value.includes("<none>"));
  if (!tag) throw new Error("Cannot update: image has no tag reference");
  return tag;
}

export async function getUpdateImageRef(
  docker: DockerClient,
  containerId: string,
): Promise<string> {
  return taggedImageRef(docker, await docker.inspectContainer(containerId));
}

export async function refreshProject(
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
  validateRefreshProject(containers, docker.connection, projectName, labels);
  const workingDir = labels["com.docker.compose.project.working_dir"] as string;
  const composeArgs = buildComposeFileArgs(
    workingDir,
    splitConfigFiles(labels["com.docker.compose.project.config_files"]),
  );
  const helperImage = "docker:27-cli";
  await docker.pullImage(helperImage);
  return runComposeHelper(docker, projectName, workingDir, composeArgs, helperImage);
}

function validateRefreshProject(
  containers: DockerContainer[],
  connection: DockerConnection,
  projectName: string,
  labels: Record<string, string>,
): void {
  if (dockerProxyProject(containers, connection) === projectName) {
    throw new Error(
      "Cannot refresh: this project contains the Docker proxy Overseer uses. Connect Overseer directly to the Docker socket to refresh it.",
    );
  }
  if (!labels["com.docker.compose.project.working_dir"]) {
    throw new Error("Cannot refresh: compose working directory label is missing");
  }
}

async function runComposeHelper(
  docker: DockerClient,
  projectName: string,
  workingDir: string,
  composeArgs: string[],
  helperImage: string,
): Promise<{ ok: true; action: string; logs: string }> {
  const helperName = `overseer-compose-refresh-${sanitizeName(projectName)}-${Date.now()}`;
  const socketBind =
    docker.connection.kind === "socket"
      ? [`${docker.connection.socketPath}:/var/run/docker.sock`]
      : [];
  const dockerHost =
    docker.connection.kind === "socket"
      ? "unix:///var/run/docker.sock"
      : docker.connection.baseUrl.replace(/^http:\/\//, "tcp://");
  const created = await docker.createContainer(helperName, {
    Image: helperImage,
    Tty: true,
    WorkingDir: workingDir,
    Env: [`DOCKER_HOST=${dockerHost}`],
    Cmd: ["compose", "-p", projectName, ...composeArgs, "up", "-d", "--remove-orphans"],
    HostConfig: { Binds: [`${workingDir}:${workingDir}`, ...socketBind] },
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

export function splitConfigFiles(value: string | undefined): string[] {
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

export function dockerProxyProject(
  containers: DockerContainer[],
  connection: DockerConnection,
): string | undefined {
  if (connection.kind !== "http") return undefined;
  const proxyHost = hostname(connection.baseUrl);
  if (!proxyHost) return undefined;
  const proxy = containers.find((container) => {
    const service = container.Labels?.["com.docker.compose.service"];
    const names = container.Names?.map((name) => name.replace(/^\//, "")) ?? [];
    return (
      service === proxyHost ||
      names.includes(proxyHost) ||
      names.some((name) => name.includes(proxyHost))
    );
  });
  return proxy?.Labels?.["com.docker.compose.project"];
}

function hostname(value: string): string | undefined {
  try {
    return new URL(value).hostname || undefined;
  } catch {
    return undefined;
  }
}

function isCurrentContainer(container: DockerContainerInspect): boolean {
  return isCurrentService(container.Id, container.Config.Labels ?? {});
}

export function isCurrentService(containerId: string, labels: Record<string, string>): boolean {
  const hostname = Bun.env.HOSTNAME;
  return (
    labels["io.sbonnick.overseer.self"] === "true" ||
    (hostname !== undefined && hostname.length > 0 && containerId.startsWith(hostname))
  );
}
