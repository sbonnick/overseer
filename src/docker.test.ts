import { describe, expect, test } from "bun:test";
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
        async () => ({ auth: "dXNlcjp0b2tlbg==", serveraddress: "ghcr.io" }),
      );
      await client.pullImage("ghcr.io/example/private-app:1.2.3");

      expect(request?.url).toBe(
        "http://docker.example/images/create?fromImage=ghcr.io%2Fexample%2Fprivate-app&tag=1.2.3",
      );
      expect(JSON.parse(atob(request?.headers.get("x-registry-auth") ?? ""))).toEqual({
        auth: "dXNlcjp0b2tlbg==",
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
