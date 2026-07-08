export const page = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Overseer</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0d1117;
        --panel: #151b23;
        --line: #30363d;
        --text: #e6edf3;
        --muted: #8b949e;
        --accent: #2f81f7;
        --good: #3fb950;
        --warn: #d29922;
        --bad: #f85149;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background: radial-gradient(circle at top left, #1f3b64, transparent 34rem), var(--bg);
        color: var(--text);
        font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0; }

      header {
        display: flex; align-items: end; justify-content: space-between;
        gap: 16px; margin-bottom: 28px;
      }

      h1, h2, h3, p { margin: 0; }
      h1 { font-size: clamp(32px, 7vw, 56px); letter-spacing: -0.06em; }
      .subtle { color: var(--muted); }

      .status {
        border: 1px solid var(--line); border-radius: 999px;
        padding: 8px 12px; white-space: nowrap;
        background: color-mix(in srgb, var(--panel), transparent 20%);
      }

      .projects { display: grid; gap: 24px; }

      .project {
        border: 1px solid var(--line); border-radius: 18px; overflow: hidden;
        background: color-mix(in srgb, var(--panel), transparent 8%);
        box-shadow: 0 24px 80px rgb(0 0 0 / 24%);
      }

      .project-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px; padding: 18px; border-bottom: 1px solid var(--line);
      }

      .stats { display: flex; flex-wrap: wrap; gap: 8px; }

      .pill {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 9px; border: 1px solid var(--line);
        border-radius: 999px; color: var(--muted);
      }

      .cards {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 0;
      }

      .card {
        display: flex; flex-direction: column; gap: 14px;
        padding: 18px; border-right: 1px solid color-mix(in srgb, var(--line), transparent 35%);
        border-bottom: 1px solid color-mix(in srgb, var(--line), transparent 35%);
      }

      .card-head { display: flex; justify-content: space-between; align-items: start; gap: 8px; }

      .card-name { font-size: 17px; font-weight: 700; }
      .card-role { color: var(--accent); font-size: 12px; }

      .state {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 13px; font-weight: 600;
      }
      .dot { width: 8px; height: 8px; border-radius: 50%; }
      .running .dot { background: var(--good); box-shadow: 0 0 8px var(--good); }
      .running { color: var(--good); }
      .stopped .dot { background: var(--bad); }
      .stopped { color: var(--bad); }
      .other .dot { background: var(--warn); }
      .other { color: var(--warn); }

      .card-image { font-size: 12px; color: var(--muted); word-break: break-all; }

      .urls { display: flex; flex-direction: column; gap: 4px; }
      .url a {
        color: var(--accent); text-decoration: none; font-size: 13px;
        word-break: break-all;
      }
      .url a:hover { text-decoration: underline; }

      .ports { display: flex; flex-wrap: wrap; gap: 6px; }
      .port {
        font-size: 11px; padding: 2px 6px; border-radius: 4px;
        background: color-mix(in srgb, var(--accent), transparent 85%);
        color: #a5d6ff;
      }

      .card-footer { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; }

      .update-badge {
        font-size: 12px; font-weight: 600; color: var(--warn);
        display: inline-flex; align-items: center; gap: 4px;
      }
      .update-badge.up-to-date { color: var(--muted); }

      .btn-update {
        border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent), transparent 88%);
        color: var(--accent); border-radius: 8px; padding: 6px 14px;
        font-size: 13px; font-weight: 600; cursor: pointer;
        transition: background 0.15s, opacity 0.15s;
      }
      .btn-update:hover:not(:disabled) { background: color-mix(in srgb, var(--accent), transparent 75%); }
      .btn-update:disabled { opacity: 0.5; cursor: default; }
      .btn-update.success { border-color: var(--good); color: var(--good); }

      .empty, .error {
        border: 1px solid var(--line); border-radius: 18px;
        padding: 24px; background: var(--panel);
      }
      .error { border-color: color-mix(in srgb, var(--bad), var(--line)); }

      @media (max-width: 760px) {
        header, .project-head { flex-direction: column; align-items: start; }
        .cards { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Overseer</h1>
          <p class="subtle">Lite Docker Compose project manager for Traefik-backed stacks.</p>
        </div>
        <div class="status" id="status">Loading...</div>
      </header>
      <section class="projects" id="projects"></section>
    </main>

    <script type="module">
      const statusEl = document.querySelector("#status");
      const projectsEl = document.querySelector("#projects");
      let pollTimer = null;

      async function refresh() {
        try {
          const response = await fetch("/api/projects");
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Request failed");
          statusEl.textContent = "Updated " + new Date(data.updatedAt).toLocaleTimeString();
          render(data.projects);
          pollTimer = setTimeout(refresh, data.pollIntervalMs || 10000);
        } catch (error) {
          statusEl.textContent = "Docker unavailable";
          projectsEl.innerHTML = '<div class="error"><h2>Unable to load projects</h2><p class="subtle">'
            + escapeHtml(error.message) + '</p></div>';
          pollTimer = setTimeout(refresh, 10000);
        }
      }

      function render(items) {
        if (!items.length) {
          projectsEl.innerHTML = '<div class="empty"><h2>No compose projects detected</h2>'
            + '<p class="subtle">Containers need the standard Docker Compose project labels.</p></div>';
          return;
        }
        projectsEl.innerHTML = items.map(renderProject).join("");
      }

      function renderProject(project) {
        return '<article class="project">'
          + '<div class="project-head">'
            + '<div><h2>' + escapeHtml(project.name) + '</h2>'
            + '<p class="subtle">' + escapeHtml(project.workingDir || "working directory unknown") + '</p></div>'
            + '<div class="stats">'
              + '<span class="pill">' + project.runningCount + "/" + project.serviceCount + ' running</span>'
              + (project.hasTraefik
                ? '<span class="pill" style="color:var(--good)">Traefik detected</span>'
                : '<span class="pill">No Traefik</span>')
            + '</div>'
          + '</div>'
          + '<div class="cards">' + project.services.map(renderCard).join("") + '</div>'
        + '</article>';
      }

      function renderCard(service) {
        const stateClass = service.state === "running" ? "running"
          : service.state === "exited" || service.state === "dead" ? "stopped" : "other";
        return '<div class="card">'
          + '<div class="card-head">'
            + '<div><div class="card-name">' + escapeHtml(service.name) + '</div>'
            + '<div class="card-role">' + escapeHtml(service.role) + '</div></div>'
            + '<div class="' + stateClass + '"><span class="dot"></span>' + escapeHtml(service.state) + '</div>'
          + '</div>'
          + '<div class="card-image">' + escapeHtml(service.image) + '</div>'
          + renderUrls(service.routes)
          + renderPorts(service.ports)
          + renderFooter(service)
        + '</div>';
      }

      function renderUrls(routes) {
        if (!routes.length) return '<div class="subtle" style="font-size:13px">No Traefik routes</div>';
        const links = routes.map(function(route) {
          if (route.hostnames.length) {
            const items = route.hostnames.map(function(host) {
              const proto = route.tls ? "https" : "http";
              return '<a href="' + proto + "://" + escapeHtml(host) + '" target="_blank" rel="noreferrer">'
                + escapeHtml(host) + '</a>';
            }).join("<br>");
            return '<div class="url">' + items + '</div>';
          }
          return '<div class="url"><code>' + escapeHtml(route.rule || "no rule") + '</code></div>';
        }).join("");
        return '<div class="urls">' + links + '</div>';
      }

      function renderPorts(ports) {
        if (!ports.length) return "";
        return '<div class="ports">' + ports.map(function(p) {
          return '<span class="port">' + escapeHtml(p) + '</span>';
        }).join("") + '</div>';
      }

      function renderFooter(service) {
        var update = service.update;
        if (!update) {
          return '<div class="card-footer"><span class="subtle" style="font-size:12px">Checking...</span></div>';
        }
        if (update.error) {
          return '<div class="card-footer"><span class="subtle" style="font-size:12px">Update check failed</span></div>';
        }
        if (update.hasUpdate) {
          return '<div class="card-footer">'
            + '<span class="update-badge">Update available</span>'
            + '<button class="btn-update" data-id="' + escapeHtml(service.id) + '" data-image="'
              + escapeHtml(service.image) + '">Update</button>'
          + '</div>';
        }
        return '<div class="card-footer"><span class="update-badge up-to-date">Up to date</span></div>';
      }

      projectsEl.addEventListener("click", async function(e) {
        const btn = e.target.closest(".btn-update");
        if (!btn || btn.disabled) return;
        const id = btn.dataset.id;
        const image = btn.dataset.image;
        btn.disabled = true;
        btn.textContent = "Updating...";

        try {
          const response = await fetch("/api/services/" + id + "/update", { method: "POST" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Update failed");
          btn.textContent = "Updated";
          btn.classList.add("success");
          if (pollTimer) clearTimeout(pollTimer);
          refresh();
        } catch (error) {
          btn.disabled = false;
          btn.textContent = "Update";
          alert("Update failed for " + image + ":\n" + error.message);
        }
      });

      function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, function(char) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
        });
      }

      refresh();
    </script>
  </body>
</html>`;
