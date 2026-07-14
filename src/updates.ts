import type { DockerClient } from "./docker.ts";
import { getLocalDigest, getRemoteDigest, hasUpdate, parseImageRef } from "./registry.ts";

export type UpdateStatus = {
  hasUpdate: boolean;
  updating?: boolean;
  remoteDigest?: string;
  localDigest?: string;
  checkedAt: string;
  error?: string;
};

export class UpdateChecker {
  private static readonly updateGracePeriodMs = 5 * 60 * 1000;
  private docker: DockerClient;
  private cache = new Map<string, UpdateStatus>();
  private updating = new Map<string, number>();
  private checkIntervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private lastCheckedAt?: string;

  constructor(docker: DockerClient, checkIntervalMs: number) {
    this.docker = docker;
    this.checkIntervalMs = checkIntervalMs;
  }

  start(): void {
    this.checkAll().catch((error) => console.error("[updates] initial check failed:", error));
    this.timer = setInterval(() => {
      this.checkAll().catch((error) => console.error("[updates] periodic check failed:", error));
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getStatus(imageRef: string): UpdateStatus | undefined {
    const status = this.cache.get(imageRef);
    const expiresAt = this.updating.get(imageRef);
    if (!expiresAt) return status;
    if (expiresAt <= Date.now()) {
      this.updating.delete(imageRef);
      return status;
    }
    return status ? { ...status, updating: true } : undefined;
  }

  markUpdating(imageRef: string): void {
    this.updating.set(imageRef, Date.now() + UpdateChecker.updateGracePeriodMs);
  }

  clearUpdating(imageRef: string): void {
    this.updating.delete(imageRef);
  }

  getLastCheckedAt(): string | undefined {
    return this.lastCheckedAt;
  }

  async invalidate(imageRef: string): Promise<void> {
    this.cache.delete(imageRef);
    await this.checkOne(imageRef);
  }

  async checkAll(): Promise<void> {
    try {
      const containers = await this.docker.listContainers();
      const imageRefs = new Set(
        containers
          .filter((c) => c.Labels?.["com.docker.compose.project"])
          .map((c) => c.Labels?.["com.docker.compose.image"] ?? c.Image),
      );
      await Promise.allSettled([...imageRefs].map((ref) => this.checkOne(ref)));
      this.lastCheckedAt = new Date().toISOString();
    } catch (error) {
      console.error("[updates] check all failed:", error);
    }
  }

  async checkOne(imageRef: string): Promise<UpdateStatus> {
    try {
      const imageInfo = await this.docker.inspectImage(imageRef);
      const updateRef = resolveUpdateImageRef(imageRef, imageInfo.RepoTags);
      const parsed = updateRef ? parseImageRef(updateRef) : null;

      let status: UpdateStatus;

      if (!parsed || parsed.digest) {
        status = { hasUpdate: false, checkedAt: new Date().toISOString() };
      } else {
        const localDigest = getLocalDigest(imageInfo.RepoDigests);
        const remoteDigest = await getRemoteDigest(parsed);
        status = {
          hasUpdate: hasUpdate(imageInfo.RepoDigests, remoteDigest),
          remoteDigest: remoteDigest ?? undefined,
          localDigest: localDigest ?? undefined,
          checkedAt: new Date().toISOString(),
        };
      }

      this.cache.set(imageRef, status);
      if (updateRef && updateRef !== imageRef) {
        this.cache.set(updateRef, status);
      }
      if (!status.hasUpdate) {
        this.clearUpdating(imageRef);
        if (updateRef) this.clearUpdating(updateRef);
      }
      return status;
    } catch (error) {
      const status: UpdateStatus = {
        hasUpdate: false,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
      this.cache.set(imageRef, status);
      return status;
    }
  }
}

export function resolveUpdateImageRef(
  imageRef: string,
  repoTags: string[] | undefined,
): string | null {
  if (!isImageId(imageRef)) return imageRef;
  return repoTags?.find((tag) => !tag.includes("<none>")) ?? null;
}

export function isImageId(imageRef: string): boolean {
  return /^sha256:[a-f0-9]{64}$/i.test(imageRef);
}
