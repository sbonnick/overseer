export type ParsedImageRef = {
  registry: string;
  repository: string;
  tag: string;
  digest?: string;
  original: string;
};

const DOCKER_HUB_REGISTRY = "registry-1.docker.io";

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

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
  const reference = parsed.digest ?? parsed.tag;
  const url = `https://${parsed.registry}/v2/${parsed.repository}/manifests/${reference}`;

  let response = await fetch(url, {
    headers: { accept: MANIFEST_ACCEPT },
    redirect: "follow",
  });

  if (response.status === 401) {
    const authHeader = response.headers.get("www-authenticate");
    if (authHeader) {
      const token = await getAuthToken(authHeader);
      if (token) {
        response = await fetch(url, {
          headers: { accept: MANIFEST_ACCEPT, authorization: `Bearer ${token}` },
          redirect: "follow",
        });
      }
    }
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Registry ${parsed.registry} returned ${response.status}`);
  }

  return response.headers.get("docker-content-digest");
}

async function getAuthToken(wwwAuthenticate: string): Promise<string | null> {
  const realmMatch = wwwAuthenticate.match(/realm="([^"]+)"/);
  if (!realmMatch?.[1]) return null;

  const params = new URLSearchParams();
  const serviceMatch = wwwAuthenticate.match(/service="([^"]+)"/);
  const scopeMatch = wwwAuthenticate.match(/scope="([^"]+)"/);
  if (serviceMatch?.[1]) params.set("service", serviceMatch[1]);
  if (scopeMatch?.[1]) params.set("scope", scopeMatch[1]);

  const response = await fetch(`${realmMatch[1]}?${params}`);
  if (!response.ok) return null;

  const data = (await response.json()) as { token?: string; access_token?: string };
  return data.token ?? data.access_token ?? null;
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
