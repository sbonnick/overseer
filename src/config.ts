export type DockerConnection =
  | { kind: "socket"; socketPath: string }
  | { kind: "http"; baseUrl: string };

export type AppConfig = {
  port: number;
  docker: DockerConnection;
  pollIntervalMs: number;
  updateCheckIntervalMs: number;
  projectFilter?: string;
  composeFilesDir: string;
};

const DEFAULT_SOCKET_PATH = "/var/run/docker.sock";
const DEFAULT_COMPOSE_FILES_DIR = "~/project";
const DEFAULT_POLL_INTERVAL_MS = 60000;

export function loadConfig(env: Record<string, string | undefined> = Bun.env): AppConfig {
  const dockerHost = env.DOCKER_HOST?.trim();
  const socketPath = env.DOCKER_SOCKET_PATH?.trim() || DEFAULT_SOCKET_PATH;
  const port = Number.parseInt(env.PORT || "3000", 10);
  const pollIntervalMs = Number.parseInt(
    env.POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS),
    10,
  );
  const projectFilter = env.COMPOSE_PROJECT?.trim() || undefined;
  const updateCheckIntervalMs = Number.parseInt(env.UPDATE_CHECK_INTERVAL_MS || "86400000", 10);
  const composeFilesDir = expandHome(
    env.COMPOSE_FILES_DIR?.trim() || DEFAULT_COMPOSE_FILES_DIR,
    env,
  );

  return {
    port: Number.isFinite(port) ? port : 3000,
    docker: parseDockerHost(dockerHost) ?? { kind: "socket", socketPath },
    pollIntervalMs: Number.isFinite(pollIntervalMs) ? pollIntervalMs : DEFAULT_POLL_INTERVAL_MS,
    updateCheckIntervalMs: Number.isFinite(updateCheckIntervalMs)
      ? updateCheckIntervalMs
      : 86400000,
    projectFilter,
    composeFilesDir,
  };
}

function expandHome(path: string, env: Record<string, string | undefined>): string {
  if (path === "~") {
    return env.HOME || "/root";
  }

  if (path.startsWith("~/")) {
    return `${env.HOME || "/root"}${path.slice(1)}`;
  }

  return path;
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
