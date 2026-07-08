import type { RouteInfo, RouteInfoByContainer } from "./discovery.ts";
import type { DockerContainer } from "./docker.ts";

type TraefikRawData = {
  http?: {
    routers?: Record<string, TraefikRawRouter>;
    services?: Record<string, TraefikRawService>;
  };
};

type TraefikRawRouter = {
  rule?: string;
  entryPoints?: string[];
  service?: string;
  tls?: unknown;
};

type TraefikRawService = {
  loadBalancer?: {
    servers?: Array<{ url?: string }>;
  };
};

export async function discoverTraefikApiRoutes(
  containers: DockerContainer[],
): Promise<RouteInfoByContainer> {
  const routes = new Map<string, RouteInfo[]>();
  const containerByTarget = mapContainersByTarget(containers);

  for (const container of containers) {
    if (!isTraefikContainer(container)) {
      continue;
    }

    const rawData = await fetchFirstRawData(getApiUrls(container));
    if (!rawData) {
      continue;
    }

    mergeRawRoutes(rawData, containerByTarget, routes);
  }

  return routes;
}

function mergeRawRoutes(
  rawData: TraefikRawData,
  containerByTarget: Map<string, DockerContainer>,
  routes: RouteInfoByContainer,
): void {
  const routers = rawData.http?.routers ?? {};
  const services = rawData.http?.services ?? {};

  for (const [routerName, router] of Object.entries(routers)) {
    if (!router.rule || !router.service) {
      continue;
    }

    const service = findRawService(services, router.service);
    const servers = service?.loadBalancer?.servers ?? [];
    for (const server of servers) {
      const target = getServerTarget(server.url);
      if (!target) {
        continue;
      }

      const container = containerByTarget.get(target.hostname);
      if (!container) {
        continue;
      }

      addRoute(routes, container.Id, {
        router: stripProvider(routerName),
        rule: router.rule,
        entrypoints: router.entryPoints ?? [],
        tls: Boolean(router.tls),
        service: stripProvider(router.service),
        port: target.port,
        hostnames: extractHostnames(router.rule),
      });
    }
  }
}

function addRoute(routes: RouteInfoByContainer, containerId: string, route: RouteInfo): void {
  const current = routes.get(containerId) ?? [];
  if (
    !current.some((existing) => existing.router === route.router && existing.rule === route.rule)
  ) {
    current.push(route);
    current.sort((a, b) => a.router.localeCompare(b.router));
  }
  routes.set(containerId, current);
}

function findRawService(
  services: Record<string, TraefikRawService>,
  name: string,
): TraefikRawService | undefined {
  const stripped = stripProvider(name);
  return services[name] ?? services[stripped] ?? services[`${stripped}@docker`];
}

function getServerTarget(url: string | undefined): { hostname: string; port?: number } | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    const port = Number.parseInt(parsed.port, 10);
    return {
      hostname: parsed.hostname,
      port: Number.isFinite(port) ? port : undefined,
    };
  } catch {
    return undefined;
  }
}

async function fetchFirstRawData(urls: string[]): Promise<TraefikRawData | undefined> {
  for (const url of urls) {
    const rawData = await fetchRawData(url);
    if (rawData) {
      return rawData;
    }
  }

  return undefined;
}

async function fetchRawData(url: string): Promise<TraefikRawData | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${url}/api/rawdata`, { signal: controller.signal });
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as TraefikRawData;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function getApiUrls(container: DockerContainer): string[] {
  const urls = new Set<string>();

  for (const port of container.Ports ?? []) {
    if (port.PrivatePort !== 8080 || port.Type !== "tcp" || !port.PublicPort) {
      continue;
    }

    const host = !port.IP || port.IP === "0.0.0.0" || port.IP === "::" ? "127.0.0.1" : port.IP;
    urls.add(`http://${host}:${port.PublicPort}`);
  }

  for (const network of Object.values(container.NetworkSettings?.Networks ?? {})) {
    if (network.IPAddress) {
      urls.add(`http://${network.IPAddress}:8080`);
    }
  }

  const serviceName = container.Labels?.["com.docker.compose.service"];
  if (serviceName) {
    urls.add(`http://${serviceName}:8080`);
  }

  const name = cleanContainerName(container.Names?.[0]);
  if (name) {
    urls.add(`http://${name}:8080`);
  }

  return Array.from(urls);
}

function mapContainersByTarget(containers: DockerContainer[]): Map<string, DockerContainer> {
  const byTarget = new Map<string, DockerContainer>();
  for (const container of containers) {
    const serviceName = container.Labels?.["com.docker.compose.service"];
    const containerName = cleanContainerName(container.Names?.[0]);

    if (serviceName) {
      byTarget.set(serviceName, container);
    }
    if (containerName) {
      byTarget.set(containerName, container);
    }

    for (const network of Object.values(container.NetworkSettings?.Networks ?? {})) {
      if (network.IPAddress) {
        byTarget.set(network.IPAddress, container);
      }
    }
  }
  return byTarget;
}

function isTraefikContainer(container: DockerContainer): boolean {
  const labels = container.Labels ?? {};
  const name =
    labels["com.docker.compose.service"] ?? cleanContainerName(container.Names?.[0]) ?? "";
  return `${name} ${container.Image}`.toLowerCase().includes("traefik");
}

function stripProvider(name: string): string {
  return name.replace(/@[^@]+$/, "");
}

function extractHostnames(rule: string): string[] {
  const hosts = new Set<string>();
  for (const match of rule.matchAll(/Host(?:Regexp)?\(([^)]+)\)/g)) {
    const values = match[1] ?? "";
    for (const value of values.split(",")) {
      const host = value.trim().replace(/^`|`$/g, "").replace(/^"|"$/g, "").replace(/^'|'$/g, "");
      if (host) {
        hosts.add(host);
      }
    }
  }

  return Array.from(hosts).sort();
}

function cleanContainerName(name: string | undefined): string | undefined {
  return name?.replace(/^\//, "");
}
