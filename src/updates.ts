import type { DockerClient } from "./docker.ts";
import { getLocalDigest, getRemoteDigest, hasUpdate, parseImageRef } from "./registry.ts";

export type UpdateStatus = {
  hasUpdate: boolean;
  updating?: boolean;
  updateError?: string;
  remoteDigest?: string;
  localDigest?: string;
  localImageId?: string;
  checkedAt: string;
  error?: string;
};

export class UpdateChecker {
  private docker: DockerClient;
  private cache = new Map<string, UpdateStatus>();
  private updating = new Map<string, string>();
  private updateErrors = new Map<string, string>();
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
      this.updating.has(imageRef) ||
      (containerId !== undefined && this.updating.get(imageRef) === containerId);
    const updateError = this.updateErrors.get(imageRef);
    if (!status && !updating && !updateError) return undefined;
    const containerHasOlderImage = Boolean(
      containerImageId && status?.localImageId && containerImageId !== status.localImageId,
    );
    return {
      ...(status ?? { hasUpdate: false, checkedAt: new Date().toISOString() }),
      hasUpdate: Boolean(status?.hasUpdate || containerHasOlderImage),
      ...(updating ? { updating: true } : {}),
      ...(updateError ? { updateError } : {}),
    };
  }

  markUpdating(imageRef: string, containerId: string): void {
    this.updateErrors.delete(imageRef);
    this.updating.set(imageRef, containerId);
  }

  finishUpdating(imageRef: string): void {
    this.updating.delete(imageRef);
  }

  failUpdating(imageRef: string, error: unknown): void {
    this.updating.delete(imageRef);
    this.updateErrors.set(
      imageRef,
      error instanceof Error ? error.message : "Unknown container update error",
    );
  }

  hasActiveUpdate(): boolean {
    return this.updating.size > 0;
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
