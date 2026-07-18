import type { DockerClient } from "./docker.ts";
import { getLocalDigest, getRemoteDigest, hasUpdate, parseImageRef } from "./registry.ts";

export type UpdateStatus = {
  hasUpdate: boolean;
  updating?: boolean;
  remoteDigest?: string;
  localDigest?: string;
  localImageId?: string;
  checkedAt: string;
  error?: string;
};

export class UpdateChecker {
  private static readonly updateGracePeriodMs = 5 * 60 * 1000;
  private docker: DockerClient;
  private cache = new Map<string, UpdateStatus>();
  private updating = new Map<string, { expiresAt: number; imageRef: string }>();
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

  getStatus(
    imageRef: string,
    containerId?: string,
    containerImageId?: string,
  ): UpdateStatus | undefined {
    const status = this.cache.get(imageRef);
    const updating =
      this.isUpdating(`image:${imageRef}`) ||
      (containerId !== undefined && this.isUpdating(`container:${containerId}`));
    if (!status) return undefined;
    const containerHasOlderImage = Boolean(
      containerImageId && status.localImageId && containerImageId !== status.localImageId,
    );
    return {
      ...status,
      hasUpdate: status.hasUpdate || containerHasOlderImage,
      ...(updating ? { updating: true } : {}),
    };
  }

  markUpdating(imageRef: string, containerId: string): void {
    const update = { expiresAt: Date.now() + UpdateChecker.updateGracePeriodMs, imageRef };
    this.updating.set(`image:${imageRef}`, update);
    this.updating.set(`container:${containerId}`, update);
  }

  clearUpdating(imageRef: string): void {
    for (const [key, update] of this.updating) {
      if (update.imageRef === imageRef) this.updating.delete(key);
    }
  }

  private isUpdating(key: string): boolean {
    const update = this.updating.get(key);
    if (!update) return false;
    if (update.expiresAt > Date.now()) return true;
    this.updating.delete(key);
    return false;
  }

  getLastCheckedAt(): string | undefined {
    return this.lastCheckedAt;
  }

  async invalidate(imageRef: string): Promise<void> {
    this.cache.delete(imageRef);
    await this.checkOne(imageRef);
  }

  async checkAll(): Promise<void> {
    const containers = await this.docker.listContainers();
    const imageRefs = new Set(
      containers
        .filter((c) => c.Labels?.["com.docker.compose.project"])
        .map((c) => c.Labels?.["com.docker.compose.image"] ?? c.Image),
    );
    await Promise.allSettled([...imageRefs].map((ref) => this.checkOne(ref)));
    this.lastCheckedAt = new Date().toISOString();
  }

  async checkOne(imageRef: string): Promise<UpdateStatus> {
    let localImageId: string | undefined;
    try {
      const imageInfo = await this.docker.inspectImage(imageRef);
      localImageId = imageInfo.Id;
      const updateRef = resolveUpdateImageRef(imageRef, imageInfo.RepoTags);
      const parsed = updateRef ? parseImageRef(updateRef) : null;

      let status: UpdateStatus;

      if (!parsed || parsed.digest) {
        status = { hasUpdate: false, localImageId, checkedAt: new Date().toISOString() };
      } else {
        const localDigest = getLocalDigest(imageInfo.RepoDigests);
        const remoteDigest = await getRemoteDigest(parsed);
        status = {
          hasUpdate: hasUpdate(imageInfo.RepoDigests, remoteDigest),
          localImageId,
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
        localImageId,
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
