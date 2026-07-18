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
  updating?: boolean;
  localImageId?: string;
  checkedAt?: string;
  error?: string;
};

export type ServiceInfo = {
  id: string;
  name: string;
  displayName?: string;
  icon?: string;
  image: string;
  imageId: string;
  state: string;
  status: string;
  role: string;
  composeService?: string;
  ports: string[];
  routes: RouteInfo[];
  labels: Record<string, string>;
  composeEditorFiles?: string[];
  isSelf?: boolean;
  update?: UpdateInfo;
};

export type RouteInfoByContainer = Map<string, RouteInfo[]>;

export type ProjectInfo = {
  name: string;
  workingDir?: string;
  configFiles: string[];
  refreshDisabledReason?: string;
  serviceCount: number;
  runningCount: number;
  hasTraefik: boolean;
  services: ServiceInfo[];
};

export function discoverProjects(
  containers: DockerContainer[],
  projectFilter?: string,
  apiRoutes: RouteInfoByContainer = new Map(),
): ProjectInfo[] {
  const projects = new Map<string, DockerContainer[]>();
  const traefik = getTraefikDefaults(containers);

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
    .map(([name, projectContainers]) => toProjectInfo(name, projectContainers, traefik, apiRoutes))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toProjectInfo(
  name: string,
  containers: DockerContainer[],
  traefik: TraefikDefaults,
  apiRoutes: RouteInfoByContainer,
): ProjectInfo {
  const firstLabels = containers[0]?.Labels ?? {};
  const services = containers
    .map((container) => toServiceInfo(container, traefik, apiRoutes))
    .sort((a, b) => a.name.localeCompare(b.name));
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

function toServiceInfo(
  container: DockerContainer,
  traefik: TraefikDefaults,
  apiRoutes: RouteInfoByContainer,
): ServiceInfo {
  const labels = container.Labels ?? {};
  const name =
    labels["com.docker.compose.service"] ??
    cleanContainerName(container.Names?.[0]) ??
    container.Id.slice(0, 12);
  const image = labels["com.docker.compose.image"] ?? container.Image;
  const role = detectRole(name, labels, image);
  const routes = apiRoutes.get(container.Id) ?? extractTraefikRoutes(labels);
  const defaultRoutes = extractDefaultTraefikRoute(container, name, traefik);

  return {
    id: container.Id,
    name,
    displayName: labels["overseer.name"],
    icon: labels["overseer.icon"],
    image,
    imageId: container.ImageID,
    state: container.State,
    status: container.Status,
    role,
    composeService: labels["com.docker.compose.service"],
    ports: formatPorts(container),
    routes: routes.length ? applyDefaultRules(routes, defaultRoutes) : defaultRoutes,
    labels,
  };
}

type TraefikDefaults = {
  networks: Set<string>;
  defaultRule: string;
};

function getTraefikDefaults(containers: DockerContainer[]): TraefikDefaults {
  const networks = new Set<string>();
  let defaultRule = "Host(`{{ normalize .Name }}`)";

  for (const container of containers) {
    const labels = container.Labels ?? {};
    const name =
      labels["com.docker.compose.service"] ?? cleanContainerName(container.Names?.[0]) ?? "";
    if (detectRole(name, labels, container.Image) !== "traefik") {
      continue;
    }

    for (const network of Object.keys(container.NetworkSettings?.Networks ?? {})) {
      networks.add(network);
    }

    defaultRule = parseTraefikDefaultRule(container.Command) ?? defaultRule;
  }

  return { networks, defaultRule };
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

function extractDefaultTraefikRoute(
  container: DockerContainer,
  serviceName: string,
  traefik: TraefikDefaults,
): RouteInfo[] {
  const labels = container.Labels ?? {};
  if (labels["traefik.enable"] === "false" || !sharesNetwork(container, traefik.networks)) {
    return [];
  }

  const containerName = cleanContainerName(container.Names?.[0]) ?? serviceName;
  const rule = renderDefaultRule(traefik.defaultRule, {
    Name: serviceName,
    ContainerName: containerName,
    ServiceName: serviceName,
  });

  return [
    {
      router: serviceName,
      rule,
      entrypoints: [],
      tls: false,
      hostnames: extractHostnames(rule),
    },
  ];
}

function applyDefaultRules(routes: RouteInfo[], defaultRoutes: RouteInfo[]): RouteInfo[] {
  const defaultRoute = defaultRoutes[0];
  if (!defaultRoute) {
    return routes;
  }

  return routes.map((route) => {
    if (route.rule) {
      return route;
    }

    return {
      ...route,
      rule: defaultRoute.rule,
      hostnames: defaultRoute.hostnames,
    };
  });
}

function sharesNetwork(container: DockerContainer, networks: Set<string>): boolean {
  if (!networks.size) {
    return false;
  }

  return Object.keys(container.NetworkSettings?.Networks ?? {}).some((network) =>
    networks.has(network),
  );
}

function parseTraefikDefaultRule(command: string): string | undefined {
  const match = command.match(/--providers\.docker\.defaultrule(?:=|\s+)(.+?)(?=\s+--|$)/i);
  return match?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2");
}

function renderDefaultRule(rule: string, values: Record<string, string>): string {
  return rule.replace(/{{\s*(.*?)\s*}}/g, (_, expression: string) => {
    const normalized = expression.match(/^normalize\s+\.([A-Za-z]+)$/);
    if (normalized) {
      return normalizeTraefikName(values[normalized[1] ?? ""] ?? "");
    }

    const field = expression.match(/^\.([A-Za-z]+)/);
    if (!field) {
      return `{{ ${expression} }}`;
    }

    let value = values[field[1] ?? ""] ?? "";
    for (const pipe of expression.slice(field[0].length).split("|")) {
      const trimSuffix = pipe.trim().match(/^trimSuffix\s+["`]([^"`]+)["`]$/);
      if (trimSuffix?.[1] && value.endsWith(trimSuffix[1])) {
        value = value.slice(0, -trimSuffix[1].length);
      }
      if (pipe.trim() === "normalize") {
        value = normalizeTraefikName(value);
      }
    }

    return value;
  });
}

function normalizeTraefikName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
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
