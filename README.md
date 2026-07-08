# overseer

A lite Docker Compose project manager designed to be deployed alongside your Traefik-backed stacks. It auto-discovers services from Docker Compose labels and Traefik router labels, exposes a clean card-based UI, and can check for and apply image updates.

## Features

- **Auto-discovery** — Detects compose projects, services, and Traefik routes from standard Docker labels (`com.docker.compose.*`, `traefik.http.routers.*`).
- **Card UI** — Each service renders as a card showing state, exposed URLs, ports, and update status.
- **Compose file editor** — Mount Compose YAML files into the configured project folder and edit them in-browser with YAML highlighting.
- **Update checking** — Compares local image digests against registry manifests daily. Supports Docker Hub, GHCR, and any OCI-compatible registry with Bearer auth.
- **One-click updates** — Pull the latest image and recreate the container, preserving all compose configuration.
- **Socket or HTTP proxy** — Connect to the Docker daemon via `/var/run/docker.sock` or an HTTP proxy URL.
- **Zero runtime dependencies** — Pure Bun + TypeScript, no npm packages shipped at runtime.

## Quick start

Add overseer to your existing Traefik compose project:

```yaml
services:
  overseer:
    image: ghcr.io/sbonnick/overseer:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./project:/root/project
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.overseer.rule=Host(`overseer.example.com`)"
      - "traefik.http.routers.overseer.port=3000"
```

Then `docker compose up -d` and visit the hostname you configured.

A full example including Traefik is in [`compose.yml`](./compose.yml).

## Configuration

All settings are via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `DOCKER_HOST` | — | HTTP/HTTPS URL of a Docker proxy socket. If unset, uses the unix socket. |
| `DOCKER_SOCKET_PATH` | `/var/run/docker.sock` | Path to the Docker unix socket |
| `POLL_INTERVAL_MS` | `10000` | UI refresh interval in milliseconds |
| `UPDATE_CHECK_INTERVAL_MS` | `86400000` (24h) | How often to check registries for image updates |
| `COMPOSE_PROJECT` | — | Filter to a single compose project name |
| `COMPOSE_FILES_DIR` | `~/project` | Directory searched recursively for Docker Compose YAML files editable in the UI |

## How it works

### Discovery

Overseer lists all containers via the Docker Engine API and groups them by the `com.docker.compose.project` label. For each container it reads:

- `com.docker.compose.service` — service name
- `com.docker.compose.project.working_dir` — project directory
- `com.docker.compose.project.config_files` — compose file paths
- `traefik.http.routers.*` — Traefik router rules, entrypoints, TLS, services
- `traefik.http.services.*.loadbalancer.server.port` — backend port

### Update checking

For each compose-managed image, overseer:

1. Inspects the local image to get `RepoDigests`.
2. Parses the image reference to determine the registry, repository, and tag.
3. Queries the registry's v2 manifest endpoint (handling Bearer auth challenges).
4. Compares the remote `Docker-Content-Digest` with the local repo digest.

If they differ, the card shows an "Update available" badge with an Update button.

### Applying updates

When the Update button is clicked, overseer:

1. Pulls the image (`POST /images/create`).
2. Inspects the new image — if the ID changed, it recreates the container with the same config (labels, volumes, networks, ports, env) pointing at the new image.
3. If the image ID is unchanged, it restarts the container as a fallback.

The recreation preserves all Docker Compose labels, so the new container remains part of its project.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Docker connection status |
| `GET` | `/api/projects` | All discovered compose projects with services and update status |
| `POST` | `/api/services/:id/update` | Pull image and recreate/restart the container |

## Development

```sh
bun install
bun run dev      # hot-reload dev server
bun run check    # biome lint + format check
bun run format   # auto-format
```

### Stack

- [Bun](https://bun.sh) + TypeScript — runtime and type checking
- [Biome](https://biomejs.dev) — linting and formatting
- No runtime npm dependencies; uses Bun built-ins (`Bun.serve`, `fetch` with unix socket support)

### Docker build

```sh
docker build -t overseer .
```

The CI workflow in [`.github/workflows/build.yml`](./.github/workflows/build.yml) builds and pushes multi-arch images to `ghcr.io` on every push to `main` and version tags.

## License

MIT
