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

      .top-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      .btn {
        border: 1px solid var(--line); background: color-mix(in srgb, var(--panel), transparent 20%);
        color: var(--text); border-radius: 10px; padding: 8px 12px;
        font: inherit; font-size: 13px; font-weight: 650; cursor: pointer;
      }
      .btn:hover:not(:disabled), .btn.active { border-color: var(--accent); color: #a5d6ff; }
      .btn:disabled { opacity: 0.5; cursor: default; }

      .compose-editor {
        display: none; grid-template-columns: 280px minmax(0, 1fr); gap: 18px;
        border: 1px solid var(--line); border-radius: 18px; overflow: hidden;
        background: color-mix(in srgb, var(--panel), transparent 8%);
        box-shadow: 0 24px 80px rgb(0 0 0 / 24%); margin-bottom: 24px;
      }
      .compose-editor.open { display: grid; }
      .file-panel { border-right: 1px solid var(--line); padding: 16px; min-width: 0; }
      .file-list { display: grid; gap: 8px; margin-top: 14px; }
      .file-item {
        border: 1px solid var(--line); background: #0d1117; color: var(--text);
        border-radius: 10px; padding: 10px; text-align: left; cursor: pointer;
        font: inherit; font-size: 13px; word-break: break-all;
      }
      .file-item.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent), transparent 88%); }
      .editor-panel { min-width: 0; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .editor-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .editor-title { min-width: 0; word-break: break-all; }
      .editor-wrap {
        position: relative; min-height: min(62vh, 720px); border: 1px solid var(--line);
        border-radius: 12px; overflow: auto; background: #05080d;
        -webkit-overflow-scrolling: touch;
      }
      .highlight, .compose-textarea {
        margin: 0; padding: 14px; min-height: min(62vh, 720px); width: 100%;
        font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        tab-size: 2; white-space: pre; overflow: hidden;
      }
      .highlight { pointer-events: none; color: #c9d1d9; }
      .compose-textarea {
        position: absolute; inset: 0; resize: none; border: 0; outline: 0;
        background: transparent; color: transparent; caret-color: var(--text);
        -webkit-text-fill-color: transparent;
      }
      .yaml-key { color: #79c0ff; }
      .yaml-string { color: #a5d6ff; }
      .yaml-bool { color: #ff7b72; }
      .yaml-comment { color: #8b949e; }
      .yaml-var { color: #d2a8ff; }

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

      .project-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

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
        header, .project-head, .editor-head { flex-direction: column; align-items: start; }
        .top-actions, .project-actions { justify-content: flex-start; }
        .cards { grid-template-columns: 1fr; }
        .compose-editor { grid-template-columns: 1fr; }
        .file-panel { border-right: 0; border-bottom: 1px solid var(--line); }
        .file-list { grid-template-columns: 1fr; }
        .editor-wrap, .highlight, .compose-textarea { min-height: 56vh; }
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
        <div class="top-actions">
          <button class="btn" id="filesToggle" type="button">Compose files</button>
          <div class="status" id="status">Loading...</div>
        </div>
      </header>
      <section class="compose-editor" id="composeEditor">
        <aside class="file-panel">
          <h2>Compose Files</h2>
          <p class="subtle" id="filesRoot">Loading files...</p>
          <div class="file-list" id="fileList"></div>
        </aside>
        <section class="editor-panel">
          <div class="editor-head">
            <div class="editor-title">
              <h2 id="editorTitle">Select a file</h2>
              <p class="subtle" id="editorStatus">Mounted compose files can be edited and saved here.</p>
            </div>
            <button class="btn" id="saveFile" type="button" disabled>Save</button>
          </div>
          <div class="editor-wrap" id="editorWrap">
            <pre class="highlight" id="highlightedYaml" aria-hidden="true"></pre>
            <textarea class="compose-textarea" id="composeTextarea" spellcheck="false" autocapitalize="off" autocomplete="off" disabled></textarea>
          </div>
        </section>
      </section>
      <section class="projects" id="projects"></section>
    </main>

    <script type="module">
      const statusEl = document.querySelector("#status");
      const projectsEl = document.querySelector("#projects");
      const filesToggle = document.querySelector("#filesToggle");
      const composeEditor = document.querySelector("#composeEditor");
      const filesRoot = document.querySelector("#filesRoot");
      const fileList = document.querySelector("#fileList");
      const editorTitle = document.querySelector("#editorTitle");
      const editorStatus = document.querySelector("#editorStatus");
      const saveFile = document.querySelector("#saveFile");
      const highlightedYaml = document.querySelector("#highlightedYaml");
      const composeTextarea = document.querySelector("#composeTextarea");
      let pollTimer = null;
      let currentFilePath = "";
      let lastSavedContent = "";
      const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

      function formatSince(value) {
        const timestamp = new Date(value).getTime();
        if (!Number.isFinite(timestamp)) return "just now";

        const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
        if (seconds < 60) return "just now";

        const units = [
          ["year", 60 * 60 * 24 * 365],
          ["month", 60 * 60 * 24 * 30],
          ["week", 60 * 60 * 24 * 7],
          ["day", 60 * 60 * 24],
          ["hour", 60 * 60],
          ["minute", 60],
        ];

        for (const [unit, unitSeconds] of units) {
          if (seconds >= unitSeconds) {
            return relativeTimeFormatter.format(-Math.floor(seconds / unitSeconds), unit);
          }
        }

        return "just now";
      }

      async function refresh() {
        try {
          const response = await fetch("/api/projects");
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Request failed");
          statusEl.textContent = "Updated " + formatSince(data.updatedAt);
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

      async function loadComposeFiles() {
        try {
          const response = await fetch("/api/compose-files");
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unable to load files");

          filesRoot.textContent = data.root;
          if (!data.files.length) {
            fileList.innerHTML = '<p class="subtle">No compose YAML files found.</p>';
            return;
          }

          fileList.innerHTML = data.files.map(function(file) {
            return '<button class="file-item" type="button" data-path="' + escapeHtml(file.path) + '">'
              + escapeHtml(file.path) + '<br><span class="subtle">'
              + formatBytes(file.size) + ' · ' + new Date(file.modifiedAt).toLocaleString()
              + '</span></button>';
          }).join("");
        } catch (error) {
          filesRoot.textContent = "Unable to load files";
          fileList.innerHTML = '<div class="error"><p>' + escapeHtml(error.message) + '</p></div>';
        }
      }

      async function openComposeFile(path) {
        editorStatus.textContent = "Opening...";
        saveFile.disabled = true;
        try {
          const response = await fetch("/api/compose-files/content?path=" + encodeURIComponent(path));
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unable to open file");

          currentFilePath = data.file.path;
          lastSavedContent = data.file.content;
          editorTitle.textContent = data.file.path;
          composeTextarea.disabled = false;
          composeTextarea.value = data.file.content;
          renderHighlight();
          setDirty(false);
          Array.from(fileList.querySelectorAll(".file-item")).forEach(function(item) {
            item.classList.toggle("active", item.dataset.path === currentFilePath);
          });
        } catch (error) {
          editorStatus.textContent = error.message;
        }
      }

      async function saveComposeFile() {
        if (!currentFilePath) return;
        saveFile.disabled = true;
        editorStatus.textContent = "Saving...";
        try {
          const response = await fetch("/api/compose-files/content?path=" + encodeURIComponent(currentFilePath), {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: composeTextarea.value })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unable to save file");

          lastSavedContent = composeTextarea.value;
          setDirty(false);
          await loadComposeFiles();
          Array.from(fileList.querySelectorAll(".file-item")).forEach(function(item) {
            item.classList.toggle("active", item.dataset.path === currentFilePath);
          });
        } catch (error) {
          editorStatus.textContent = error.message;
          saveFile.disabled = false;
        }
      }

      function renderHighlight() {
        highlightedYaml.innerHTML = highlightYaml(composeTextarea.value) || "\n";
        const height = Math.max(composeTextarea.scrollHeight, highlightedYaml.scrollHeight, 320);
        composeTextarea.style.height = height + "px";
        highlightedYaml.style.height = height + "px";
      }

      function highlightYaml(value) {
        return escapeHtml(value).split("\n").map(function(line) {
          const commentIndex = line.indexOf("#");
          const comment = commentIndex >= 0 ? '<span class="yaml-comment">' + line.slice(commentIndex) + '</span>' : "";
          const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
          return code
            .replace(/^([\s-]*)([A-Za-z0-9_.-]+)(\s*:)/, '$1<span class="yaml-key">$2</span>$3')
            .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="yaml-string">$1</span>')
            .replace(/\$\{[^}]+\}/g, '<span class="yaml-var">$&</span>')
            .replace(/\b(true|false|null)\b/g, '<span class="yaml-bool">$1</span>')
            + comment;
        }).join("\n");
      }

      function setDirty(isDirty) {
        saveFile.disabled = !currentFilePath || !isDirty;
        editorStatus.textContent = currentFilePath
          ? (isDirty ? "Unsaved changes" : "Saved")
          : "Mounted compose files can be edited and saved here.";
      }

      function formatBytes(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
        return (bytes / 1024 / 1024).toFixed(1) + " MB";
      }

      function renderProject(project) {
        return '<article class="project">'
          + '<div class="project-head">'
            + '<div><h2>' + escapeHtml(project.name) + '</h2>'
            + '<p class="subtle">' + escapeHtml(project.workingDir || "working directory unknown") + '</p></div>'
            + '<div class="project-actions">'
              + '<button class="btn btn-refresh-project" type="button" data-project="'
                + escapeHtml(project.name) + '">Refresh project</button>'
              + '<div class="stats">'
                + '<span class="pill">' + project.runningCount + "/" + project.serviceCount + ' running</span>'
                + (project.hasTraefik
                  ? '<span class="pill" style="color:var(--good)">Traefik detected</span>'
                  : '<span class="pill">No Traefik</span>')
              + '</div>'
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
        const refreshBtn = e.target.closest(".btn-refresh-project");
        if (refreshBtn && !refreshBtn.disabled) {
          await refreshProject(refreshBtn);
          return;
        }

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

      async function refreshProject(btn) {
        const project = btn.dataset.project;
        btn.disabled = true;
        btn.textContent = "Refreshing...";

        try {
          const response = await fetch("/api/projects/" + encodeURIComponent(project) + "/refresh", {
            method: "POST"
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Refresh failed");
          btn.textContent = "Refreshed";
          btn.classList.add("active");
          if (pollTimer) clearTimeout(pollTimer);
          refresh();
        } catch (error) {
          btn.disabled = false;
          btn.textContent = "Refresh project";
          alert("Refresh failed for " + project + ":\n" + error.message);
        }
      }

      filesToggle.addEventListener("click", function() {
        const open = !composeEditor.classList.contains("open");
        composeEditor.classList.toggle("open", open);
        filesToggle.classList.toggle("active", open);
        if (open) loadComposeFiles();
      });

      fileList.addEventListener("click", function(e) {
        const item = e.target.closest(".file-item");
        if (!item) return;
        if (composeTextarea.value !== lastSavedContent && !confirm("Discard unsaved changes?")) {
          return;
        }
        openComposeFile(item.dataset.path);
      });

      composeTextarea.addEventListener("input", function() {
        renderHighlight();
        setDirty(composeTextarea.value !== lastSavedContent);
      });

      composeTextarea.addEventListener("keydown", function(e) {
        if (e.key === "Tab") {
          e.preventDefault();
          const start = composeTextarea.selectionStart;
          const end = composeTextarea.selectionEnd;
          composeTextarea.setRangeText("  ", start, end, "end");
          composeTextarea.dispatchEvent(new Event("input"));
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveComposeFile();
        }
      });

      saveFile.addEventListener("click", saveComposeFile);

      function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, function(char) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
        });
      }

      refresh();
    </script>
  </body>
</html>`;
