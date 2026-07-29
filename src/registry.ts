import { Buffer } from "node:buffer";

export type ParsedImageRef = {
  registry: string;
  repository: string;
  tag: string;
  digest?: string;
  original: string;
};

const DOCKER_HUB_REGISTRY = "registry-1.docker.io";
const DOCKER_HUB_AUTH_ALIASES = new Set([
  DOCKER_HUB_REGISTRY,
  "docker.io",
  "index.docker.io",
  "https://index.docker.io/v1/",
]);

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

const IMAGE_VERSION_LABELS = ["org.opencontainers.image.version", "org.label-schema.version"];

export type RemoteImageMetadata = {
  digest?: string;
  created?: string;
  version?: string;
};

export function parseImageRef(ref: string): ParsedImageRef | null {
  let digest: string | undefined;
  let nameAndTag = ref;

  const atIndex = ref.lastIndexOf("@");
  if (atIndex !== -1) {
    digest = ref.slice(atIndex + 1);
    nameAndTag = ref.slice(0, atIndex);
  }

  let tag = "latest";
  let name = nameAndTag;
  const colonIndex = nameAndTag.lastIndexOf(":");
  if (colonIndex !== -1) {
    const afterColon = nameAndTag.slice(colonIndex + 1);
    if (!afterColon.includes("/")) {
      tag = afterColon;
      name = nameAndTag.slice(0, colonIndex);
    }
  }

  let registry = DOCKER_HUB_REGISTRY;
  let repository = name;
  const slashIndex = name.indexOf("/");
  if (slashIndex !== -1) {
    const firstPart = name.slice(0, slashIndex);
    if (firstPart.includes(".") || firstPart.includes(":") || firstPart === "localhost") {
      registry = firstPart;
      repository = name.slice(slashIndex + 1);
    }
  }

  if (registry === DOCKER_HUB_REGISTRY && !repository.includes("/")) {
    repository = `library/${repository}`;
  }

  return { registry, repository, tag, digest, original: ref };
}

export async function getRemoteDigest(parsed: ParsedImageRef): Promise<string | null> {
  return (await getRemoteImageMetadata(parsed)).digest ?? null;
}

export async function getRemoteImageMetadata(parsed: ParsedImageRef): Promise<RemoteImageMetadata> {
  const reference = parsed.digest ?? parsed.tag;
  const url = `https://${parsed.registry}/v2/${parsed.repository}/manifests/${reference}`;
  const pullScope = `repository:${parsed.repository}:pull`;
  const response = await registryRequest(url, parsed.registry, pullScope, MANIFEST_ACCEPT);

  if (response.status === 404) {
    return {};
  }

  if (!response.ok) {
    throw new Error(
      `Registry ${parsed.registry} returned ${response.status} for ${parsed.repository}:${reference}`,
    );
  }

  const digest = response.headers.get("docker-content-digest") ?? undefined;
  let manifest = (await response.json().catch(() => null)) as {
    config?: { digest?: string };
    manifests?: Array<{ digest?: string; platform?: { os?: string; architecture?: string } }>;
  } | null;
  if (!manifest?.config?.digest) {
    const architecture = process.arch === "x64" ? "amd64" : process.arch;
    const child =
      manifest?.manifests?.find(
        (item) => item.platform?.os === "linux" && item.platform.architecture === architecture,
      ) ?? manifest?.manifests?.[0];
    if (child?.digest) {
      const childResponse = await registryRequest(
        `https://${parsed.registry}/v2/${parsed.repository}/manifests/${child.digest}`,
        parsed.registry,
        pullScope,
        MANIFEST_ACCEPT,
      );
      if (childResponse.ok) {
        manifest = (await childResponse.json().catch(() => null)) as typeof manifest;
      }
    }
  }
  const configDigest = manifest?.config?.digest;
  if (!configDigest) return { digest };

  const configResponse = await registryRequest(
    `https://${parsed.registry}/v2/${parsed.repository}/blobs/${configDigest}`,
    parsed.registry,
    pullScope,
    "application/vnd.oci.image.config.v1+json, application/vnd.docker.container.image.v1+json",
  );
  if (!configResponse.ok) return { digest };
  const config = (await configResponse.json().catch(() => null)) as {
    created?: string;
    config?: { Labels?: Record<string, string> | null };
  } | null;
  return {
    digest,
    ...(config?.created ? { created: config.created } : {}),
    ...(imageVersion(config?.config?.Labels)
      ? { version: imageVersion(config?.config?.Labels) }
      : {}),
  };
}

async function registryRequest(
  url: string,
  registry: string,
  pullScope: string,
  accept: string,
): Promise<Response> {
  let response = await fetch(url, { headers: { accept }, redirect: "follow" });
  if (response.status !== 401) return response;

  const authHeader = response.headers.get("www-authenticate");
  if (!authHeader) return response;
  const token = await getAuthToken(authHeader, registry, pullScope);
  if (!token) return response;
  response = await fetch(url, {
    headers: { accept, authorization: `Bearer ${token}` },
    redirect: "follow",
  });
  if (response.status !== 401) return response;

  const retryToken = await getAuthToken(
    response.headers.get("www-authenticate") ?? authHeader,
    registry,
    pullScope,
    true,
  );
  if (!retryToken || retryToken === token) return response;
  return fetch(url, {
    headers: { accept, authorization: `Bearer ${retryToken}` },
    redirect: "follow",
  });
}

export function imageVersion(
  labels: Record<string, string> | null | undefined,
): string | undefined {
  return IMAGE_VERSION_LABELS.map((label) => labels?.[label]).find(Boolean);
}

async function getAuthToken(
  wwwAuthenticate: string,
  registry: string,
  fallbackScope?: string,
  forceScope = false,
): Promise<string | null> {
  const challenge = parseAuthChallenge(wwwAuthenticate);
  const realm = challenge.get("realm");
  if (!realm) return null;

  const params = new URLSearchParams();
  const service = challenge.get("service");
  const scope = forceScope ? fallbackScope : (challenge.get("scope") ?? fallbackScope);
  if (service) params.set("service", service);
  if (scope) params.set("scope", scope);

  const credential = await getRegistryCredential(registry);
  const response = await fetch(`${realm}?${params}`, {
    headers: credential ? { authorization: credential.authorization } : undefined,
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { token?: string; access_token?: string };
  return data.token ?? data.access_token ?? null;
}

type DockerAuthEntry = {
  auth?: string;
  username?: string;
  password?: string;
  identitytoken?: string;
};

type DockerAuthConfig = {
  auths?: Record<string, DockerAuthEntry>;
};

type RegistryCredential = {
  authorization: string;
};

let dockerAuthConfigPromise: Promise<DockerAuthConfig | null> | undefined;

async function getRegistryCredential(registry: string): Promise<RegistryCredential | null> {
  const config = await loadDockerAuthConfig();
  const auths = config?.auths;
  if (!auths) return null;

  for (const alias of registryAliases(registry)) {
    const entry = auths[alias] ?? auths[stripProtocol(alias)];
    const credential = entry ? toRegistryCredential(entry) : null;
    if (credential) return credential;
  }

  return null;
}

function loadDockerAuthConfig(): Promise<DockerAuthConfig | null> {
  dockerAuthConfigPromise ??= readDockerAuthConfig();
  return dockerAuthConfigPromise;
}

async function readDockerAuthConfig(): Promise<DockerAuthConfig | null> {
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
  if (DOCKER_HUB_AUTH_ALIASES.has(registry)) {
    return [...DOCKER_HUB_AUTH_ALIASES];
  }
  return [registry, `https://${registry}`, `https://${registry}/v1/`];
}

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//, "");
}

function toRegistryCredential(entry: DockerAuthEntry): RegistryCredential | null {
  if (entry.auth) return { authorization: `Basic ${entry.auth}` };
  if (entry.username && entry.password) {
    return {
      authorization: `Basic ${Buffer.from(`${entry.username}:${entry.password}`).toString("base64")}`,
    };
  }
  if (entry.identitytoken) return { authorization: `Bearer ${entry.identitytoken}` };
  return null;
}

function parseAuthChallenge(wwwAuthenticate: string): Map<string, string> {
  const params = new Map<string, string>();
  const parts = wwwAuthenticate.replace(/^\s*Bearer\s+/i, "");
  const pattern = /([a-zA-Z_][\w-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  match = pattern.exec(parts);
  while (match !== null) {
    params.set(match[1].toLowerCase(), match[2]);
    match = pattern.exec(parts);
  }
  return params;
}

export function getLocalDigest(repoDigests: string[] | undefined): string | null {
  if (!repoDigests || repoDigests.length === 0) return null;
  const first = repoDigests[0];
  const atIndex = first.lastIndexOf("@");
  return atIndex !== -1 ? first.slice(atIndex + 1) : null;
}

export function hasUpdate(repoDigests: string[] | undefined, remoteDigest: string | null): boolean {
  if (!remoteDigest) return false;
  if (!repoDigests || repoDigests.length === 0) return false;
  const localDigests = repoDigests.map((d) => {
    const atIndex = d.lastIndexOf("@");
    return atIndex !== -1 ? d.slice(atIndex + 1) : d;
  });
  return !localDigests.includes(remoteDigest);
}
