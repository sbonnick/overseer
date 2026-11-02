import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { DockerClient } from "./docker.ts";

describe("DockerClient.pullImage", () => {
  test("forwards a GHCR credential to Docker Engine", async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(String(input), init);
      return new Response("");
    }) as typeof fetch;

    try {
      const client = new DockerClient(
        { kind: "http", baseUrl: "http://docker.example" },
        async () => ({ username: "user", password: "token", serveraddress: "ghcr.io" }),
      );
      await client.pullImage("ghcr.io/example/private-app:1.2.3");

      expect(request?.url).toBe(
        "http://docker.example/images/create?fromImage=ghcr.io%2Fexample%2Fprivate-app&tag=1.2.3",
      );
      const encodedAuth = request?.headers.get("x-registry-auth") ?? "";
      expect(encodedAuth).toBe(
        Buffer.from(
          JSON.stringify({ username: "user", password: "token", serveraddress: "ghcr.io" }),
        )
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_"),
      );
      expect(encodedAuth.endsWith("=")).toBe(true);
      expect(JSON.parse(Buffer.from(encodedAuth, "base64url").toString())).toEqual({
        username: "user",
        password: "token",
        serveraddress: "ghcr.io",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not send a registry-auth header without a credential", async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(String(input), init);
      return new Response("");
    }) as typeof fetch;

    try {
      const client = new DockerClient(
        { kind: "http", baseUrl: "http://docker.example" },
        async () => null,
      );
      await client.pullImage("public.example/app:latest");
      expect(request?.headers.has("x-registry-auth")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
