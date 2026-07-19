const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

const svgAssets = new Set([
  "favicon.svg",
  "favicon-16.svg",
  "favicon-32.svg",
  "overseer.svg",
  "overseer-180.svg",
  "overseer-192.svg",
  "overseer-512.svg",
  "overseer-maskable.svg",
]);

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function errorStatus(error: unknown, fallback = 400): number {
  return error instanceof Error && "status" in error && typeof error.status === "number"
    ? error.status
    : fallback;
}

export function staticResponse(url: URL): Response | undefined {
  if (url.pathname === "/favicon.svg") return svgAsset("favicon.svg");

  const assetName = url.pathname.match(/^\/assets\/([a-z0-9-]+\.svg)$/)?.[1];
  if (assetName && svgAssets.has(assetName)) return svgAsset(assetName);

  if (url.pathname === "/manifest.webmanifest") {
    return new Response(Bun.file("assets/manifest.webmanifest"), {
      headers: {
        "cache-control": "public, max-age=86400",
        "content-type": "application/manifest+json; charset=utf-8",
      },
    });
  }
}

export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(new Error("Request body is too large"), { status: 413 });
  }
  if (!request.body) throw new Error("Missing request body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error("Request body is too large"), { status: 413 });
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

function svgAsset(fileName: string): Response {
  return new Response(Bun.file(`assets/${fileName}`), {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
}
