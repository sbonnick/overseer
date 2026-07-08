export type DockerConnection =
  | { kind: "socket"; socketPath: string }
  | { kind: "http"; baseUrl: string };

export type AppConfig = {
  port: number;
  docker: DockerConnection;
  pollIntervalMs: number;
  updateCheckIntervalMs: number;
  projectFilter?: string;
};

const DEFAULT_SOCKET_PATH = "/var/run/docker.sock";

export function loadConfig(env: Record<string, string | undefined> = Bun.env): AppConfig {
  const dockerHost = env.DOCKER_HOST?.trim();
  const socketPath = env.DOCKER_SOCKET_PATH?.trim() || DEFAULT_SOCKET_PATH;
  const port = Number.parseInt(env.PORT || "3000", 10);
  const pollIntervalMs = Number.parseInt(env.POLL_INTERVAL_MS || "10000", 10);
  const projectFilter = env.COMPOSE_PROJECT?.trim() || undefined;
  const updateCheckIntervalMs = Number.parseInt(env.UPDATE_CHECK_INTERVAL_MS || "86400000", 10);

  return {
    port: Number.isFinite(port) ? port : 3000,
    docker: parseDockerHost(dockerHost) ?? { kind: "socket", socketPath },
    pollIntervalMs: Number.isFinite(pollIntervalMs) ? pollIntervalMs : 10000,
    updateCheckIntervalMs: Number.isFinite(updateCheckIntervalMs)
      ? updateCheckIntervalMs
      : 86400000,
    projectFilter,
  };
}

function parseDockerHost(dockerHost: string | undefined): DockerConnection | undefined {
  if (dockerHost?.startsWith("http://") || dockerHost?.startsWith("https://")) {
    return { kind: "http", baseUrl: dockerHost.replace(/\/$/, "") };
  }
  if (dockerHost?.startsWith("tcp://")) {
    return {
      kind: "http",
      baseUrl: `http://${dockerHost.slice("tcp://".length)}`.replace(/\/$/, ""),
    };
  }
  const socketPath = parseSocketPath(dockerHost);
  return socketPath ? { kind: "socket", socketPath } : undefined;
}

function parseSocketPath(dockerHost: string | undefined): string | undefined {
  if (!dockerHost?.startsWith("unix://")) return undefined;
  return dockerHost.slice("unix://".length) || undefined;
}
