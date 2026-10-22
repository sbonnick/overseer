import { describe, expect, test } from "bun:test";
import { registryAuthorization, registryForImage, resolveRegistryAuth } from "./registry-auth.ts";

describe("registry credentials", () => {
  test("resolves a GHCR auth entry for Docker Engine", () => {
    const auth = resolveRegistryAuth(
      { auths: { "ghcr.io": { auth: "dXNlcjp0b2tlbg==" } } },
      "ghcr.io",
    );

    expect(auth).toEqual({ auth: "dXNlcjp0b2tlbg==", serveraddress: "ghcr.io" });
    expect(registryAuthorization(auth)).toBe("Basic dXNlcjp0b2tlbg==");
  });

  test("matches Docker Hub config aliases for unqualified images", () => {
    const auth = resolveRegistryAuth(
      { auths: { "https://index.docker.io/v1/": { username: "user", password: "token" } } },
      registryForImage("library/alpine:latest"),
    );

    expect(auth).toMatchObject({
      username: "user",
      password: "token",
      serveraddress: "registry-1.docker.io",
    });
  });

  test("does not mistake an unqualified image tag for a registry", () => {
    expect(registryForImage("alpine:3.21")).toBe("registry-1.docker.io");
  });

  test("does not return incomplete or unmatched credentials", () => {
    expect(
      resolveRegistryAuth({ auths: { "ghcr.io": { username: "user" } } }, "ghcr.io"),
    ).toBeNull();
    expect(
      resolveRegistryAuth({ auths: { "registry.example": { auth: "value" } } }, "ghcr.io"),
    ).toBeNull();
  });
});
