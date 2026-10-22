import { Buffer } from "node:buffer";

const DOCKER_HUB_REGISTRY = "registry-1.docker.io";
const DOCKER_HUB_AUTH_ALIASES = new Set([
  DOCKER_HUB_REGISTRY,
  "docker.io",
  "index.docker.io",
  "https://index.docker.io/v1/",
]);

export type DockerAuthEntry = {
  auth?: string;
  username?: string;
  password?: string;
  identitytoken?: string;
};

export type DockerAuthConfig = {
  auths?: Record<string, DockerAuthEntry>;
};

export type DockerEngineAuth = DockerAuthEntry & {
  serveraddress: string;
};

export function registryForImage(image: string): string {
  const name = image.split("@")[0] ?? image;
  const slashIndex = name.indexOf("/");
  if (slashIndex === -1) return DOCKER_HUB_REGISTRY;
  const firstPart = name.slice(0, slashIndex);
  return firstPart.includes(".") || firstPart.includes(":") || firstPart === "localhost"
    ? firstPart
    : DOCKER_HUB_REGISTRY;
}

export async function getRegistryAuth(registry: string): Promise<DockerEngineAuth | null> {
  return resolveRegistryAuth(await loadDockerAuthConfig(), registry);
}

export function resolveRegistryAuth(
  config: DockerAuthConfig | null | undefined,
  registry: string,
): DockerEngineAuth | null {
  const auths = config?.auths;
  if (!auths) return null;

  for (const alias of registryAliases(registry)) {
    const entry = auths[alias] ?? auths[stripProtocol(alias)];
    if (entry && hasCredential(entry)) return { ...entry, serveraddress: registry };
  }

  return null;
}

export function registryAuthorization(auth: DockerAuthEntry | null): string | null {
  if (!auth) return null;
  if (auth.auth) return `Basic ${auth.auth}`;
  if (auth.username && auth.password) {
    return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`;
  }
  if (auth.identitytoken) return `Bearer ${auth.identitytoken}`;
  return null;
}

async function loadDockerAuthConfig(): Promise<DockerAuthConfig | null> {
  const inlineConfig = Bun.env.DOCKER_AUTH_CONFIG?.trim();
  if (inlineConfig) return parseDockerAuthConfig(inlineConfig);

  const dockerConfigDir = Bun.env.DOCKER_CONFIG?.trim() || `${Bun.env.HOME || "/root"}/.docker`;
  const file = Bun.file(`${dockerConfigDir.replace(/\/$/, "")}/config.json`);
  if (!(await file.exists())) return null;
  return parseDockerAuthConfig(await file.text());
}

function parseDockerAuthConfig(value: string): DockerAuthConfig | null {
  try {
    const parsed = JSON.parse(value) as DockerAuthConfig;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function registryAliases(registry: string): string[] {
  if (DOCKER_HUB_AUTH_ALIASES.has(registry)) return [...DOCKER_HUB_AUTH_ALIASES];
  return [registry, `https://${registry}`, `https://${registry}/v1/`];
}

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//, "");
}

function hasCredential(entry: DockerAuthEntry): boolean {
  return Boolean(entry.auth || (entry.username && entry.password) || entry.identitytoken);
}
