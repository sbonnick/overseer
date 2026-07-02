import type { DockerContainer } from "./docker.ts";

export type RouteInfo = {
  router: string;
  rule?: string;
  entrypoints: string[];
  tls: boolean;
  service?: string;
  port?: number;
  hostnames: string[];
};

export type UpdateInfo = {
  hasUpdate: boolean;
  checkedAt?: string;
  error?: string;
};

export type ServiceInfo = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  role: string;
  composeService?: string;
  ports: string[];
  routes: RouteInfo[];
  labels: Record<string, string>;
  update?: UpdateInfo;
};

export type ProjectInfo = {
  name: string;
  workingDir?: string;
  configFiles: string[];
  serviceCount: number;
  runningCount: number;
  hasTraefik: boolean;
  services: ServiceInfo[];
};

export function discoverProjects(
  containers: DockerContainer[],
  projectFilter?: string,
): ProjectInfo[] {
  const projects = new Map<string, DockerContainer[]>();

  for (const container of containers) {
    const project = container.Labels?.["com.docker.compose.project"];
    if (!project || (projectFilter && project !== projectFilter)) {
      continue;
    }

    const list = projects.get(project) ?? [];
    list.push(container);
    projects.set(project, list);
  }

  return Array.from(projects.entries())
    .map(([name, projectContainers]) => toProjectInfo(name, projectContainers))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toProjectInfo(name: string, containers: DockerContainer[]): ProjectInfo {
  const firstLabels = containers[0]?.Labels ?? {};
  const services = containers.map(toServiceInfo).sort((a, b) => a.name.localeCompare(b.name));
  const configFiles = splitConfigFiles(firstLabels["com.docker.compose.project.config_files"]);

  return {
    name,
    workingDir: firstLabels["com.docker.compose.project.working_dir"],
    configFiles,
    serviceCount: services.length,
    runningCount: services.filter((service) => service.state === "running").length,
    hasTraefik: services.some((service) => service.role === "traefik"),
    services,
  };
}

function toServiceInfo(container: DockerContainer): ServiceInfo {
  const labels = container.Labels ?? {};
  const name =
    labels["com.docker.compose.service"] ??
    cleanContainerName(container.Names?.[0]) ??
    container.Id.slice(0, 12);
  const role = detectRole(name, labels, container.Image);

  return {
    id: container.Id,
    name,
    image: container.Image,
    state: container.State,
    status: container.Status,
    role,
    composeService: labels["com.docker.compose.service"],
    ports: formatPorts(container),
    routes: extractTraefikRoutes(labels),
    labels,
  };
}

function detectRole(name: string, labels: Record<string, string>, image: string): string {
  const explicit = labels["overseer.role"];
  if (explicit) {
    return explicit;
  }

  const value = `${name} ${image}`.toLowerCase();
  if (value.includes("traefik")) {
    return "traefik";
  }

  if (Object.keys(labels).some((label) => label.startsWith("traefik."))) {
    return "routed";
  }

  return "service";
}

function extractTraefikRoutes(labels: Record<string, string>): RouteInfo[] {
  const routers = new Map<string, RouteInfo>();
  const services = new Map<string, number>();

  for (const [label, value] of Object.entries(labels)) {
    const serviceMatch = label.match(
      /^traefik\.http\.services\.([^.]+)\.loadbalancer\.server\.port$/i,
    );
    if (serviceMatch) {
      const port = Number.parseInt(value, 10);
      if (Number.isFinite(port)) {
        services.set(serviceMatch[1] ?? "", port);
      }
    }
  }

  for (const [label, value] of Object.entries(labels)) {
    const match = label.match(/^traefik\.http\.routers\.([^.]+)\.(.+)$/i);
    if (!match) {
      continue;
    }

    const [, routerName, field] = match;
    if (!routerName || !field) {
      continue;
    }

    const route = routers.get(routerName) ?? {
      router: routerName,
      entrypoints: [],
      tls: false,
      hostnames: [],
    };

    if (field === "rule") {
      route.rule = value;
      route.hostnames = extractHostnames(value);
    } else if (field === "entrypoints") {
      route.entrypoints = value
        .split(",")
        .map((entrypoint) => entrypoint.trim())
        .filter(Boolean);
    } else if (field === "tls") {
      route.tls = value === "true";
    } else if (field === "service") {
      route.service = value;
      route.port = services.get(value);
    }

    routers.set(routerName, route);
  }

  for (const route of routers.values()) {
    if (!route.port && services.size === 1) {
      route.port = Array.from(services.values())[0];
    }
  }

  return Array.from(routers.values()).sort((a, b) => a.router.localeCompare(b.router));
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

function formatPorts(container: DockerContainer): string[] {
  return (container.Ports ?? []).map((port) => {
    const privatePort = `${port.PrivatePort}/${port.Type}`;
    return port.PublicPort
      ? `${port.IP ?? "0.0.0.0"}:${port.PublicPort}->${privatePort}`
      : privatePort;
  });
}

function splitConfigFiles(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((file) => file.trim())
      .filter(Boolean) ?? []
  );
}

function cleanContainerName(name: string | undefined): string | undefined {
  return name?.replace(/^\//, "");
}
