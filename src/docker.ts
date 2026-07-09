import type { DockerConnection } from "./config.ts";

export type DockerContainer = {
  Id: string;
  Names?: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: string;
  Status: string;
  Ports?: Array<{
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
  Labels?: Record<string, string>;
  NetworkSettings?: {
    Networks?: Record<string, { IPAddress?: string; NetworkID?: string }>;
  };
};

export type DockerContainerInspect = {
  Id: string;
  Name: string;
  Image: string;
  Config: {
    Image: string;
    Cmd?: string[] | null;
    Entrypoint?: string[] | null;
    Env?: string[] | null;
    Labels?: Record<string, string> | null;
    WorkingDir?: string;
    User?: string;
    ExposedPorts?: Record<string, unknown> | null;
    Hostname?: string;
    Domainname?: string;
    Tty?: boolean;
    OpenStdin?: boolean;
    StdinOnce?: boolean;
    AttachStdin?: boolean;
    AttachStdout?: boolean;
    AttachStderr?: boolean;
  };
  HostConfig: Record<string, unknown>;
  NetworkSettings?: {
    Networks?: Record<
      string,
      {
        IPAMConfig?: unknown;
        Links?: string[] | null;
        Aliases?: string[] | null;
      }
    >;
  };
  Mounts?: Array<{
    Type?: string;
    Source?: string;
    Destination?: string;
    Mode?: string;
    RW?: boolean;
    Propagation?: string;
  }>;
};

export type DockerImageInspect = {
  Id: string;
  RepoTags?: string[];
  RepoDigests?: string[];
  Created?: string;
};

export type DockerError = Error & { status?: number };

type RequestOptions = {
  method?: string;
  body?: string;
  text?: boolean;
};

type DockerRequestInit = RequestInit & { unix?: string };

export class DockerClient {
  readonly connection: DockerConnection;

  constructor(connection: DockerConnection) {
    this.connection = connection;
  }

  async listContainers(): Promise<DockerContainer[]> {
    return this.request<DockerContainer[]>("/containers/json?all=true");
  }

  async inspectContainer(id: string): Promise<DockerContainerInspect> {
    return this.request<DockerContainerInspect>(`/containers/${id}/json`);
  }

  async inspectImage(ref: string): Promise<DockerImageInspect> {
    return this.request<DockerImageInspect>(`/images/${encodeURIComponent(ref)}/json`);
  }

  async ping(): Promise<boolean> {
    const value = await this.request<string>("/_ping", { text: true });
    return value.trim() === "OK";
  }

  async pullImage(ref: string): Promise<void> {
    const { fromImage, tag, digest } = parsePullRef(ref);
    const params = new URLSearchParams({ fromImage });
    if (tag) params.set("tag", tag);
    if (digest) params.set("digest", digest);
    await this.request<string>(`/images/create?${params}`, { method: "POST", text: true });
  }

  async stopContainer(id: string, timeoutSeconds?: number): Promise<void> {
    const query = timeoutSeconds !== undefined ? `?t=${timeoutSeconds}` : "";
    await this.request<void>(`/containers/${id}/stop${query}`, { method: "POST" });
  }

  async removeContainer(
    id: string,
    options: { force?: boolean; volumes?: boolean } = {},
  ): Promise<void> {
    const params = new URLSearchParams();
    if (options.force) params.set("force", "true");
    if (options.volumes) params.set("v", "true");
    const query = params.toString() ? `?${params}` : "";
    await this.request<void>(`/containers/${id}${query}`, { method: "DELETE" });
  }

  async createContainer(name: string, config: unknown): Promise<{ Id: string }> {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return this.request<{ Id: string }>(`/containers/create${query}`, {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  async startContainer(id: string): Promise<void> {
    await this.request<void>(`/containers/${id}/start`, { method: "POST" });
  }

  async restartContainer(id: string, timeoutSeconds?: number): Promise<void> {
    const query = timeoutSeconds !== undefined ? `?t=${timeoutSeconds}` : "";
    await this.request<void>(`/containers/${id}/restart${query}`, { method: "POST" });
  }

  async waitContainer(id: string): Promise<{ StatusCode: number; Error?: { Message?: string } }> {
    return this.request<{ StatusCode: number; Error?: { Message?: string } }>(
      `/containers/${id}/wait`,
      { method: "POST" },
    );
  }

  async containerLogs(id: string): Promise<string> {
    return this.request<string>(`/containers/${id}/logs?stdout=true&stderr=true`, { text: true });
  }

  private buildUrl(path: string): string {
    return this.connection.kind === "http"
      ? `${this.connection.baseUrl}${path}`
      : `http://docker${path}`;
  }

  private buildInit(options: RequestOptions): DockerRequestInit {
    const headers: Record<string, string> = {};
    if (options.body) {
      headers["content-type"] = "application/json";
    }
    return {
      method: options.method ?? "GET",
      headers,
      ...(this.connection.kind === "socket" ? { unix: this.connection.socketPath } : {}),
      ...(options.body !== undefined ? { body: options.body } : {}),
    };
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.fetchDocker(path, options);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(
        `Docker API returned ${response.status}${body ? `: ${truncate(body, 200)}` : ""}`,
      ) as DockerError;
      error.status = response.status;
      throw error;
    }

    const text = await response.text();
    if (options.text) {
      return text as T;
    }
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  private async fetchDocker(path: string, options: RequestOptions): Promise<Response> {
    try {
      return await fetch(this.buildUrl(path), this.buildInit(options));
    } catch (error) {
      throw new Error(`Unable to connect to Docker API via ${this.describeConnection()}`, {
        cause: error,
      });
    }
  }

  private describeConnection(): string {
    return this.connection.kind === "http"
      ? this.connection.baseUrl
      : `unix socket ${this.connection.socketPath}`;
  }
}

function parsePullRef(ref: string): { fromImage: string; tag?: string; digest?: string } {
  const atIndex = ref.lastIndexOf("@");
  if (atIndex !== -1) {
    return { fromImage: ref.slice(0, atIndex), digest: ref.slice(atIndex + 1) };
  }

  const colonIndex = ref.lastIndexOf(":");
  if (colonIndex !== -1) {
    const afterColon = ref.slice(colonIndex + 1);
    if (!afterColon.includes("/")) {
      return { fromImage: ref.slice(0, colonIndex), tag: afterColon };
    }
  }

  return { fromImage: ref, tag: "latest" };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
