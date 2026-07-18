export const page = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/assets/favicon-16.svg" sizes="16x16" type="image/svg+xml" />
    <link rel="icon" href="/assets/favicon-32.svg" sizes="32x32" type="image/svg+xml" />
    <link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/assets/overseer-180.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
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
      .sr-only {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
      }

      body {
        margin: 0;
        background-color: var(--bg);
        background-image: radial-gradient(circle at top left, #1f3b64, transparent 34rem);
        background-repeat: no-repeat;
        background-size: 68rem 68rem;
        color: var(--text);
        font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0; }

      header {
        display: flex; align-items: end; justify-content: space-between;
        gap: 16px; margin-bottom: 28px;
      }

      h1, h2, h3, p { margin: 0; }
      h1 { display: flex; align-items: center; gap: 12px; font-size: clamp(32px, 7vw, 56px); letter-spacing: -0.06em; }
      .app-icon { width: 0.72em; height: 0.72em; flex: 0 0 0.72em; }
      .subtle { color: var(--muted); }

      .status {
        display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line);
        border-radius: 999px; padding: 8px 12px; white-space: nowrap;
        background: color-mix(in srgb, var(--panel), transparent 20%); color: var(--text);
        font: inherit; cursor: pointer;
      }
      .status:hover:not(:disabled) { border-color: var(--accent); color: #a5d6ff; }
      .status:disabled { cursor: wait; }
      .status-icon { width: 15px; height: 15px; flex: 0 0 15px; }
      .status.refreshing .status-icon { animation: spin 0.8s linear infinite; }

      .top-actions { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; justify-content: flex-end; }

      .btn, .toggle {
        border: 1px solid var(--line); background: color-mix(in srgb, var(--panel), transparent 20%);
        color: var(--text); border-radius: 10px; padding: 8px 12px;
        font: inherit; font-size: 13px; font-weight: 650; cursor: pointer;
      }
      .btn:hover:not(:disabled), .btn.active, .toggle:hover { border-color: var(--accent); color: #a5d6ff; }
      .btn:disabled { opacity: 0.5; cursor: default; }
      .editor-launch { display: inline-grid; place-items: center; width: 38px; height: 38px; padding: 0; }
      .editor-launch svg { width: 19px; height: 19px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; }
      .toggle-track {
        position: relative; width: 30px; height: 18px; flex: 0 0 30px;
        border: 1px solid var(--muted); border-radius: 999px; background: var(--line);
        transition: background 0.15s, border-color 0.15s;
      }
      .toggle-track::after {
        content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px;
        border-radius: 50%; background: var(--muted); transition: transform 0.15s, background 0.15s;
      }
      .toggle[aria-checked="true"] { border-color: var(--accent); color: #a5d6ff; }
      .toggle[aria-checked="true"] .toggle-track { border-color: var(--accent); background: var(--accent); }
      .toggle[aria-checked="true"] .toggle-track::after { background: white; transform: translateX(12px); }

      body.editor-open { overflow: hidden; }
      .compose-editor {
        --editor-bar-height: 64px;
        position: fixed; inset: 0; z-index: 20; display: none;
        grid-template-rows: var(--editor-bar-height) minmax(0, 1fr);
        background: #05080d;
      }
      .compose-editor.open { display: grid; }
      .file-panel {
        position: absolute; z-index: 3; top: var(--editor-bar-height); bottom: 0; left: 0;
        width: min(360px, calc(100vw - 48px)); padding: 18px; overflow-y: auto;
        border-right: 1px solid var(--line); background: var(--panel);
        box-shadow: 24px 0 70px rgb(0 0 0 / 35%); transform: translateX(-105%);
        transition: transform 0.18s ease;
      }
      .compose-editor.files-open .file-panel { transform: translateX(0); }
      .file-backdrop {
        position: absolute; z-index: 2; inset: var(--editor-bar-height) 0 0; display: none;
        border: 0; background: rgb(0 0 0 / 55%); cursor: default;
      }
      .compose-editor.files-open .file-backdrop { display: block; }
      .file-list { display: grid; gap: 8px; margin-top: 14px; }
      .file-item {
        border: 1px solid var(--line); background: #0d1117; color: var(--text);
        border-radius: 10px; padding: 10px; text-align: left; cursor: pointer;
        font: inherit; font-size: 13px; word-break: break-all;
      }
      .file-item.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent), transparent 88%); }
      .editor-panel { grid-row: 2; min-width: 0; min-height: 0; }
      .editor-head {
        grid-row: 1; z-index: 4; display: flex; align-items: center; gap: 10px;
        min-width: 0; padding: 10px 12px; border-bottom: 1px solid var(--line); background: var(--panel);
        box-shadow: 0 8px 30px rgb(0 0 0 / 24%); overflow-x: auto;
      }
      .editor-title { flex: 1 1 auto; min-width: 0; text-align: center; }
      .editor-title h2 { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
      .editor-title p { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .editor-actions, .editor-tools { display: flex; align-items: center; gap: 6px; }
      .editor-actions { flex: 0 0 auto; }
      .editor-tool {
        display: inline-grid; place-items: center; width: 42px; height: 42px; padding: 0;
        border: 1px solid var(--line); border-radius: 9px; background: #0d1117;
        color: var(--muted); cursor: pointer;
      }
      .editor-tool:hover:not(:disabled), .editor-tool[aria-pressed="true"] {
        border-color: var(--accent); color: #a5d6ff;
      }
      .editor-tool:disabled { opacity: 0.5; cursor: default; }
      .editor-tool.primary { border-color: var(--accent); color: #a5d6ff; }
      .editor-tool svg { width: 20px; height: 20px; }
      .editor-wrap {
        position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; background: #05080d;
      }
      .highlight, .compose-textarea {
        margin: 0; padding: 14px;
        font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        tab-size: 2; white-space: pre;
      }
      .highlight {
        position: absolute; top: 0; left: 0; min-width: 100%; min-height: 100%; width: max-content;
        pointer-events: none; color: #c9d1d9; transform-origin: top left;
      }
      .compose-textarea {
        position: absolute; inset: 0; width: 100%; height: 100%; resize: none; border: 0; outline: 0;
        background: transparent; color: transparent; caret-color: var(--text);
        -webkit-text-fill-color: transparent; overflow: auto; scrollbar-gutter: stable;
        -webkit-overflow-scrolling: touch;
      }
      .editor-wrap.wrap-lines .highlight { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .editor-wrap.wrap-lines .compose-textarea { white-space: pre-wrap; overflow-wrap: anywhere; }
      .yaml-key { color: #79c0ff; }
      .yaml-string { color: #a5d6ff; }
      .yaml-bool { color: #ff7b72; }
      .yaml-comment { color: #8b949e; }
      .yaml-var { color: #d2a8ff; }
      .syntax-number { color: #ffa657; }

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
      .card-controls { display: flex; align-items: center; gap: 8px; }
      .btn-card-icon {
        display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0;
        border: 1px solid var(--line); border-radius: 8px; background: transparent;
        color: var(--muted); cursor: pointer;
      }
      .btn-card-icon:hover:not(:disabled) { border-color: var(--accent); color: #a5d6ff; }
      .btn-card-icon:disabled { opacity: 0.35; cursor: default; }
      .btn-card-icon svg { width: 16px; height: 16px; }

      .service-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .service-icon { width: 42px; height: 42px; flex: 0 0 42px; padding: 4px; object-fit: contain; }
      .service-details { min-width: 0; }
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

      .refresh-overlay {
        position: fixed; inset: 0; z-index: 10; display: none; place-items: center; padding: 24px;
        background: rgb(13 17 23 / 92%); backdrop-filter: blur(10px);
      }
      .refresh-overlay.visible { display: grid; }
      .refresh-dialog {
        width: min(400px, 100%); padding: 28px; text-align: center;
        border: 1px solid var(--line); border-radius: 18px; background: var(--panel);
        box-shadow: 0 24px 80px rgb(0 0 0 / 35%);
      }
      .refresh-spinner {
        width: 32px; height: 32px; margin: 0 auto 16px; border: 3px solid var(--line);
        border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      @media (max-width: 760px) {
        header, .project-head { flex-direction: column; align-items: start; }
        .top-actions { width: 100%; justify-content: flex-start; overflow-x: auto; padding-bottom: 4px; }
        .project-actions { justify-content: flex-start; }
        .cards { grid-template-columns: 1fr; }
        .compose-editor { --editor-bar-height: 60px; }
        .editor-head { gap: 5px; padding: 8px; }
        .editor-title p { display: none; }
        .editor-tools { gap: 4px; }
        .editor-tool { width: 42px; height: 42px; }
        .highlight, .compose-textarea { font-size: 16px; }
        .compose-textarea { scrollbar-gutter: auto; }
      }
      @media (max-width: 520px) {
        .editor-title { display: none; }
      }
    </style>
  </head>
  <body>
    <main>
      <header id="pageHeader">
        <div>
          <h1><img class="app-icon" src="/assets/overseer.svg" alt="" />Overseer</h1>
          <p class="subtle">Lite Docker Compose project manager for Traefik-backed stacks.</p>
        </div>
        <div class="top-actions">
          <button class="status" id="status" type="button" title="Check for updates now">Loading...</button>
          <button class="toggle" id="portsToggle" type="button" role="switch" aria-checked="false">
            <span>Ports</span><span class="toggle-track" aria-hidden="true"></span>
          </button>
          <button class="toggle" id="imageToggle" type="button" role="switch" aria-checked="false">
            <span>Image</span><span class="toggle-track" aria-hidden="true"></span>
          </button>
          <button class="btn editor-launch" id="filesToggle" type="button" aria-label="Open compose editor" title="Open compose editor" aria-controls="composeEditor" aria-expanded="false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="m9 15 2 2 4-4"></path></svg>
          </button>
        </div>
      </header>
      <section class="compose-editor" id="composeEditor" role="dialog" aria-modal="true" aria-label="Compose file editor">
        <div class="editor-head">
          <button class="editor-tool" id="fileMenuToggle" type="button" aria-label="Choose file" title="Choose file" aria-controls="filePanel" aria-expanded="false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"></path></svg>
          </button>
          <div class="editor-title">
            <h2 id="editorTitle">Select a file</h2>
            <p class="subtle" id="editorStatus" role="status" aria-live="polite">Choose a Compose file to begin editing.</p>
          </div>
          <div class="editor-actions">
            <div class="editor-tools" role="toolbar" aria-label="Compose editor tools">
              <button class="editor-tool" type="button" data-editor-action="outdent" aria-label="Outdent" title="Outdent" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 6h10M11 12h10M11 18h10M7 8l-4 4 4 4"></path></svg>
              </button>
              <button class="editor-tool" type="button" data-editor-action="indent" aria-label="Indent" title="Indent" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 6h8M13 12h8M13 18h8M3 8l4 4-4 4"></path></svg>
              </button>
              <button class="editor-tool" id="wrapLines" type="button" aria-label="Wrap lines" title="Wrap lines" aria-pressed="false" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h14a3 3 0 0 1 0 6H7"></path><path d="m10 9-3 3 3 3"></path><path d="M4 18h7"></path></svg>
              </button>
            </div>
            <button class="editor-tool primary" id="saveFile" type="button" aria-label="Save file" title="Save file" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><path d="M17 21v-8H7v8M7 3v5h8"></path></svg>
            </button>
            <button class="editor-tool" id="closeEditor" type="button" aria-label="Close editor" title="Close editor">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>
        <aside class="file-panel" id="filePanel" inert>
          <h2>Compose Files</h2>
          <p class="subtle" id="filesRoot">Loading files...</p>
          <div class="file-list" id="fileList"></div>
        </aside>
        <button class="file-backdrop" id="fileBackdrop" type="button" tabindex="-1" aria-label="Close file menu"></button>
        <section class="editor-panel">
          <div class="editor-wrap" id="editorWrap">
            <pre class="highlight" id="highlightedYaml" aria-hidden="true"></pre>
            <textarea class="compose-textarea" id="composeTextarea" aria-label="Compose file editor" aria-describedby="editorHelp" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" disabled></textarea>
          </div>
          <p class="sr-only" id="editorHelp">Tab indents. Press Escape, then Tab to move focus out of the editor.</p>
        </section>
      </section>
      <section class="projects" id="projects"></section>
      <div class="refresh-overlay" id="refreshOverlay" role="status" aria-live="assertive">
        <div class="refresh-dialog">
          <div class="refresh-spinner" aria-hidden="true"></div>
          <h2>Applying compose changes</h2>
          <p class="subtle">Waiting for Overseer to come back online...</p>
        </div>
      </div>
    </main>

    <script type="module">
      const statusEl = document.querySelector("#status");
      const projectsEl = document.querySelector("#projects");
      const pageHeader = document.querySelector("#pageHeader");
      const filesToggle = document.querySelector("#filesToggle");
      const portsToggle = document.querySelector("#portsToggle");
      const imageToggle = document.querySelector("#imageToggle");
      const refreshOverlay = document.querySelector("#refreshOverlay");
      const composeEditor = document.querySelector("#composeEditor");
      const fileMenuToggle = document.querySelector("#fileMenuToggle");
      const filePanel = document.querySelector("#filePanel");
      const fileBackdrop = document.querySelector("#fileBackdrop");
      const closeEditor = document.querySelector("#closeEditor");
      const filesRoot = document.querySelector("#filesRoot");
      const fileList = document.querySelector("#fileList");
      const editorTitle = document.querySelector("#editorTitle");
      const editorStatus = document.querySelector("#editorStatus");
      const saveFile = document.querySelector("#saveFile");
      const editorWrap = document.querySelector("#editorWrap");
      const editorTools = document.querySelector(".editor-tools");
      const wrapLines = document.querySelector("#wrapLines");
      const highlightedYaml = document.querySelector("#highlightedYaml");
      const composeTextarea = document.querySelector("#composeTextarea");
      let pollTimer = null;
      let currentFilePath = "";
      let lastSavedContent = "";
      let currentProjects = [];
      let showPorts = false;
      let showImage = false;
      let isRefreshing = false;
      let isSaving = false;
      let openFileRequest = 0;
      let locateServiceRequest = 0;
      const bulkUpdateProjects = new Map();
      let updatesCheckedAt = null;
      let tabMovesFocus = false;
      const mobileEditorQuery = window.matchMedia("(max-width: 760px)");
      const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });
      const refreshIcon = '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-15.23-6.36L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 15.23 6.36L21 16"></path><path d="M21 21v-5h-5"></path></svg>';

      async function readJson(response) {
        const body = await response.text();
        try {
          return body ? JSON.parse(body) : {};
        } catch {
          const error = new Error("Server returned " + response.status + ": " + (body || response.statusText));
          error.status = response.status;
          throw error;
        }
      }

      function setRefreshOverlay(visible) {
        refreshOverlay.classList.toggle("visible", visible);
      }

      async function waitForOverseer() {
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
          try {
            const response = await fetch("/api/health", {
              cache: "no-store",
              signal: AbortSignal.timeout(5000)
            });
            if (response.ok) return true;
          } catch {}
          await new Promise(function(resolve) { setTimeout(resolve, 1000); });
        }
        return false;
      }

      function isTemporaryGatewayError(error) {
        return error instanceof TypeError || error.name === "TimeoutError"
          || [502, 503, 504].includes(error.status);
      }

      function setStatus(message, refreshing) {
        statusEl.classList.toggle("refreshing", refreshing);
        statusEl.innerHTML = refreshIcon + '<span>' + escapeHtml(message) + '</span>';
      }

      function renderUpdateStatus() {
        setStatus(updatesCheckedAt
          ? "Updates checked " + formatSince(updatesCheckedAt)
          : "Checking updates...", false);
      }

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

      async function refresh(checkForUpdates) {
        if (isRefreshing) return;
        isRefreshing = true;
        statusEl.disabled = true;
        setStatus(checkForUpdates ? "Checking updates..." : "Refreshing...", true);
        try {
          if (checkForUpdates) {
            const checkResponse = await fetch("/api/updates/check", {
              method: "POST",
              signal: AbortSignal.timeout(60000)
            });
            const checkData = await readJson(checkResponse);
            if (!checkResponse.ok) throw new Error(checkData.error || "Update check failed");
            if (checkData.updatesCheckedAt) updatesCheckedAt = checkData.updatesCheckedAt;
          }
          const response = await fetch("/api/projects", { signal: AbortSignal.timeout(30000) });
          const data = await readJson(response);
          if (!response.ok) throw new Error(data.error || "Request failed");
          if (data.updatesCheckedAt) updatesCheckedAt = data.updatesCheckedAt;
          renderUpdateStatus();
          currentProjects = data.projects;
          render(currentProjects);
          pollTimer = setTimeout(refresh, data.pollIntervalMs || 5000);
        } catch (error) {
          setStatus("Docker unavailable", false);
          projectsEl.innerHTML = '<div class="error"><h2>Unable to load projects</h2><p class="subtle">'
            + escapeHtml(error.message) + '</p></div>';
          pollTimer = setTimeout(refresh, 5000);
        } finally {
          isRefreshing = false;
          statusEl.disabled = false;
        }
      }

      function render(items) {
        if (!items.length) {
          if (!projectsEl.querySelector(".empty")) {
            projectsEl.innerHTML = '<div class="empty"><h2>No compose projects detected</h2>'
              + '<p class="subtle">Containers need the standard Docker Compose project labels.</p></div>';
          }
          return;
        }

        for (const child of Array.from(projectsEl.children)) {
          if (!child.matches(".project")) child.remove();
        }

        const projectNames = new Set(items.map(function(project) { return project.name; }));
        for (const projectEl of Array.from(projectsEl.querySelectorAll(".project"))) {
          if (!projectNames.has(projectEl.dataset.project)) projectEl.remove();
        }

        for (const project of items) {
          let projectEl = Array.from(projectsEl.querySelectorAll(".project")).find(function(element) {
            return element.dataset.project === project.name;
          });
          if (!projectEl) {
            projectEl = createElement(renderProject(project));
            projectsEl.append(projectEl);
            continue;
          }
          reconcileProject(projectEl, project);
          projectsEl.append(projectEl);
        }
      }

      function createElement(html) {
        const template = document.createElement("template");
        template.innerHTML = html;
        return template.content.firstElementChild;
      }

      function reconcileProject(projectEl, project) {
        const nextProject = createElement(renderProject(project));
        const currentHead = projectEl.querySelector(":scope > .project-head");
        const nextHead = nextProject.querySelector(":scope > .project-head");
        if (currentHead.innerHTML !== nextHead.innerHTML) currentHead.replaceWith(nextHead);

        const cards = projectEl.querySelector(":scope > .cards");
        const nextCards = nextProject.querySelector(":scope > .cards");
        const serviceIds = new Set(Array.from(nextCards.children).map(function(card) { return card.dataset.service; }));
        for (const card of Array.from(cards.children)) {
          if (!serviceIds.has(card.dataset.service)) card.remove();
        }
        for (const nextCard of Array.from(nextCards.children)) {
          const currentCard = Array.from(cards.children).find(function(card) {
            return card.dataset.service === nextCard.dataset.service;
          });
          if (!currentCard) {
            cards.append(nextCard);
          } else {
            if (currentCard.innerHTML !== nextCard.innerHTML) {
              currentCard.replaceWith(nextCard);
              cards.append(nextCard);
            } else {
              cards.append(currentCard);
            }
          }
        }
      }

      async function loadComposeFiles() {
        try {
          const response = await fetch("/api/compose-files");
          const data = await readJson(response);
          if (!response.ok) throw new Error(data.error || "Unable to load files");

          filesRoot.textContent = data.root;
          if (!data.files.length) {
            fileList.innerHTML = '<p class="subtle">No Compose YAML or JSON files found.</p>';
            return;
          }

          fileList.innerHTML = data.files.map(function(file) {
            return '<button class="file-item" type="button" data-path="' + escapeHtml(file.path) + '">'
              + escapeHtml(file.path) + '<br><span class="subtle">'
              + formatBytes(file.size) + ' · ' + new Date(file.modifiedAt).toLocaleString()
              + '</span></button>';
          }).join("");
          Array.from(fileList.querySelectorAll(".file-item")).forEach(function(item) {
            item.classList.toggle("active", item.dataset.path === currentFilePath);
          });
        } catch (error) {
          filesRoot.textContent = "Unable to load files";
          fileList.innerHTML = '<div class="error"><p>' + escapeHtml(error.message) + '</p></div>';
        }
      }

      async function openComposeFile(path, serviceName, servicePaths) {
        locateServiceRequest += 1;
        const requestId = ++openFileRequest;
        editorStatus.textContent = "Opening...";
        saveFile.disabled = true;
        composeTextarea.disabled = true;
        Array.from(editorTools.querySelectorAll("button")).forEach(function(button) {
          button.disabled = true;
        });
        try {
          const response = serviceName && servicePaths?.length > 1
            ? await fetch("/api/compose-files/service-content", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ paths: servicePaths, service: serviceName })
            })
            : await fetch("/api/compose-files/content?path=" + encodeURIComponent(path)
              + (serviceName ? "&service=" + encodeURIComponent(serviceName) : ""));
          const data = await readJson(response);
          if (!response.ok) throw new Error(data.error || "Unable to open file");
          if (requestId !== openFileRequest) return;

          currentFilePath = data.file.path;
          lastSavedContent = data.file.content;
          editorTitle.textContent = data.file.path;
          composeTextarea.setAttribute("aria-label", /\.json$/i.test(currentFilePath)
            ? "Docker Compose JSON editor"
            : "Docker Compose YAML editor");
          composeTextarea.disabled = false;
          Array.from(editorTools.querySelectorAll("button")).forEach(function(button) {
            button.disabled = false;
          });
          composeTextarea.value = data.file.content;
          composeTextarea.scrollTop = 0;
          composeTextarea.scrollLeft = 0;
          renderHighlight();
          setDirty(false);
          Array.from(fileList.querySelectorAll(".file-item")).forEach(function(item) {
            item.classList.toggle("active", item.dataset.path === currentFilePath);
          });
          setFileMenuOpen(false);
          revealComposeService(data.file.serviceOffset);
        } catch (error) {
          if (requestId !== openFileRequest) return;
          composeTextarea.disabled = !currentFilePath;
          Array.from(editorTools.querySelectorAll("button")).forEach(function(button) {
            button.disabled = !currentFilePath;
          });
          setDirty(Boolean(currentFilePath) && composeTextarea.value !== lastSavedContent);
          editorStatus.textContent = error.message;
        }
      }

      function revealComposeService(offset) {
        const position = Number.isInteger(offset) ? offset : 0;
        composeTextarea.blur();
        composeTextarea.setSelectionRange(position, position);
        composeTextarea.focus();
        requestAnimationFrame(function() {
          if (position > 0) composeTextarea.scrollTop = Math.max(0,
            composeTextarea.scrollTop - composeTextarea.clientHeight * 0.2);
          composeTextarea.scrollLeft = 0;
          syncHighlightScroll();
        });
      }

      async function saveComposeFile() {
        if (!currentFilePath) return;
        const contentToSave = composeTextarea.value;
        isSaving = true;
        setDirty(contentToSave !== lastSavedContent);
        editorStatus.textContent = "Saving...";
        try {
          const response = await fetch("/api/compose-files/content?path=" + encodeURIComponent(currentFilePath), {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: contentToSave })
          });
          const data = await readJson(response);
          if (!response.ok) throw new Error(data.error || "Unable to save file");

          lastSavedContent = contentToSave;
          isSaving = false;
          setDirty(composeTextarea.value !== lastSavedContent);
          await loadComposeFiles();
          Array.from(fileList.querySelectorAll(".file-item")).forEach(function(item) {
            item.classList.toggle("active", item.dataset.path === currentFilePath);
          });
        } catch (error) {
          isSaving = false;
          setDirty(composeTextarea.value !== lastSavedContent);
          editorStatus.textContent = error.message;
        }
      }

      function renderHighlight() {
        highlightedYaml.innerHTML = (/\.json$/i.test(currentFilePath)
          ? highlightJson(composeTextarea.value)
          : highlightYaml(composeTextarea.value)) || "\n";
        highlightedYaml.style.width = editorWrap.classList.contains("wrap-lines")
          ? composeTextarea.clientWidth + "px"
          : "max-content";
        syncHighlightScroll();
      }

      function syncHighlightScroll() {
        highlightedYaml.style.transform = "translate(" + (-composeTextarea.scrollLeft) + "px, "
          + (-composeTextarea.scrollTop) + "px)";
      }

      function setLineWrapping(enabled) {
        editorWrap.classList.toggle("wrap-lines", enabled);
        wrapLines.setAttribute("aria-pressed", String(enabled));
        composeTextarea.setAttribute("wrap", enabled ? "soft" : "off");
        renderHighlight();
      }

      function changeIndent(outdent) {
        if (composeTextarea.disabled) return;
        const value = composeTextarea.value;
        const selectionStart = composeTextarea.selectionStart;
        const selectionEnd = composeTextarea.selectionEnd;
        const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;

        if (selectionStart === selectionEnd && !outdent) {
          composeTextarea.setRangeText("  ", selectionStart, selectionEnd, "end");
          composeTextarea.dispatchEvent(new Event("input"));
          composeTextarea.focus();
          return;
        }

        if (selectionStart === selectionEnd) {
          const line = value.slice(lineStart);
          const removed = line.startsWith("  ") ? 2 : line.startsWith(" ") ? 1 : 0;
          if (removed) {
            composeTextarea.setRangeText("", lineStart, lineStart + removed, "end");
            const caret = Math.max(lineStart, selectionStart - removed);
            composeTextarea.setSelectionRange(caret, caret);
            composeTextarea.dispatchEvent(new Event("input"));
          }
          composeTextarea.focus();
          return;
        }

        const selectedEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
          ? selectionEnd - 1
          : selectionEnd;
        const nextLineBreak = value.indexOf("\n", selectedEnd);
        const changeEnd = nextLineBreak < 0 ? value.length : nextLineBreak;
        const selected = value.slice(lineStart, changeEnd);
        const lines = selected.split("\n");
        let firstRemoved = 0;
        let totalRemoved = 0;

        const changed = lines.map(function(line, index) {
          if (!outdent) return "  " + line;
          const removed = line.startsWith("  ") ? 2 : line.startsWith(" ") ? 1 : 0;
          if (index === 0) firstRemoved = removed;
          totalRemoved += removed;
          return line.slice(removed);
        }).join("\n");

        composeTextarea.setRangeText(changed, lineStart, changeEnd, "select");
        const firstLineAdjustment = Math.min(firstRemoved, selectionStart - lineStart);
        const nextStart = outdent ? selectionStart - firstLineAdjustment : selectionStart + 2;
        const nextEnd = outdent
          ? selectionEnd - totalRemoved
          : selectionEnd + lines.length * 2;
        composeTextarea.setSelectionRange(
          Math.max(lineStart, nextStart),
          Math.max(lineStart, nextEnd)
        );
        composeTextarea.dispatchEvent(new Event("input"));
        composeTextarea.focus();
      }

      function highlightYaml(value) {
        return value.split("\n").map(function(line) {
          const commentIndex = findYamlComment(line);
          let code = commentIndex < 0 ? line : line.slice(0, commentIndex);
          const comment = commentIndex < 0
            ? ""
            : '<span class="yaml-comment">' + escapeHtml(line.slice(commentIndex)) + '</span>';
          let prefix = "";
          const key = code.match(/^(\s*-?\s*)([A-Za-z0-9_.-]+)(\s*:)/);
          if (key) {
            prefix = escapeHtml(key[1]) + '<span class="yaml-key">' + escapeHtml(key[2]) + '</span>'
              + escapeHtml(key[3]);
            code = code.slice(key[0].length);
          }
          return prefix + highlightYamlValue(code) + comment;
        }).join("\n");
      }

      function findYamlComment(line) {
        let quote = "";
        for (let index = 0; index < line.length; index += 1) {
          const char = line[index];
          if (quote === '"' && char === "\\") {
            index += 1;
          } else if (char === quote) {
            quote = "";
          } else if (!quote && (char === '"' || char === "'")) {
            quote = char;
          } else if (!quote && char === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
            return index;
          }
        }
        return -1;
      }

      function highlightYamlValue(value) {
        const tokenPattern = /("(?:\\.|[^"\\])*"|'(?:''|[^'])*')|(\$\{[^}]+\})|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
        let html = "";
        let index = 0;
        for (const match of value.matchAll(tokenPattern)) {
          html += escapeHtml(value.slice(index, match.index));
          const className = match[1] ? "yaml-string"
            : match[2] ? "yaml-var"
            : match[3] ? "yaml-bool"
            : "syntax-number";
          html += '<span class="' + className + '">' + escapeHtml(match[0]) + '</span>';
          index = match.index + match[0].length;
        }
        return html + escapeHtml(value.slice(index));
      }

      function highlightJson(value) {
        const tokenPattern = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
        let html = "";
        let index = 0;
        for (const match of value.matchAll(tokenPattern)) {
          html += escapeHtml(value.slice(index, match.index));
          if (match[1]) {
            const className = match[2] ? "yaml-key" : "yaml-string";
            html += '<span class="' + className + '">' + escapeHtml(match[1]) + '</span>'
              + escapeHtml(match[2] || "");
          } else if (match[3]) {
            html += '<span class="syntax-number">' + escapeHtml(match[3]) + '</span>';
          } else {
            html += '<span class="yaml-bool">' + escapeHtml(match[0]) + '</span>';
          }
          index = match.index + match[0].length;
        }
        return html + escapeHtml(value.slice(index));
      }

      function setDirty(isDirty) {
        saveFile.disabled = isSaving || !currentFilePath || !isDirty;
        const message = currentFilePath
          ? (isDirty ? "Unsaved changes" : "Saved")
          : "Choose a Compose file to begin editing.";
        if (editorStatus.textContent !== message) editorStatus.textContent = message;
      }

      function setFileMenuOpen(open) {
        composeEditor.classList.toggle("files-open", open);
        fileMenuToggle.setAttribute("aria-expanded", String(open));
        filePanel.toggleAttribute("inert", !open);
      }

      function setEditorOpen(open) {
        composeEditor.classList.toggle("open", open);
        document.body.classList.toggle("editor-open", open);
        pageHeader.toggleAttribute("inert", open);
        projectsEl.toggleAttribute("inert", open);
        filesToggle.classList.toggle("active", open);
        filesToggle.setAttribute("aria-expanded", String(open));
        if (!open) {
          setFileMenuOpen(false);
          filesToggle.focus();
          return;
        }
        loadComposeFiles();
        setFileMenuOpen(!currentFilePath);
        requestAnimationFrame(function() {
          renderHighlight();
          (currentFilePath ? composeTextarea : fileMenuToggle).focus();
        });
      }

      function closeComposeEditor() {
        if (isSaving) {
          alert("Wait for the current save to finish before closing the editor.");
          return;
        }
        if (composeTextarea.value !== lastSavedContent && !confirm("Close without saving changes?")) return;
        setEditorOpen(false);
      }

      function formatBytes(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
        return (bytes / 1024 / 1024).toFixed(1) + " MB";
      }

      function renderProject(project) {
        const refreshDisabled = Boolean(project.refreshDisabledReason);
        const availableUpdates = project.services.filter(function(service) {
          return service.update?.hasUpdate && !service.update?.updating;
        }).length;
        const bulkUpdate = bulkUpdateProjects.get(project.name);
        const anyBulkUpdate = bulkUpdateProjects.size > 0;
        const bulkLabel = bulkUpdate
          ? "Updating " + bulkUpdate.completed + "/" + bulkUpdate.total
          : availableUpdates ? "Update all (" + availableUpdates + ")" : "All up to date";
        return '<article class="project" data-project="' + escapeHtml(project.name) + '">'
          + '<div class="project-head">'
            + '<div><h2>' + escapeHtml(project.name) + '</h2>'
            + '<p class="subtle">' + escapeHtml(project.workingDir || "working directory unknown") + '</p></div>'
            + '<div class="project-actions">'
              + '<button class="btn btn-update-project" type="button" data-project="'
                + escapeHtml(project.name) + '"'
                + (!availableUpdates || anyBulkUpdate ? ' disabled' : '')
                + ' title="Update every container in this project with an available image update">'
                + escapeHtml(bulkLabel) + '</button>'
              + '<button class="btn btn-refresh-project" type="button" data-project="'
                + escapeHtml(project.name) + '"'
                + (refreshDisabled || anyBulkUpdate ? ' disabled title="' + escapeHtml(project.refreshDisabledReason || "Updates are in progress") + '"' : ' title="Apply saved compose file changes by running docker compose up for this project"')
                + '>Apply compose changes</button>'
              + '<div class="stats">'
                + '<span class="pill">' + project.runningCount + "/" + project.serviceCount + ' running</span>'
                + (project.hasTraefik
                  ? '<span class="pill" style="color:var(--good)">Traefik detected</span>'
                  : '<span class="pill">No Traefik</span>')
              + '</div>'
            + '</div>'
          + '</div>'
          + '<div class="cards">' + project.services
            .toSorted(function(a, b) {
              return Number(Boolean(b.update?.hasUpdate || b.update?.updating)) - Number(Boolean(a.update?.hasUpdate || a.update?.updating));
            })
            .map(function(service) { return renderCard(service, anyBulkUpdate); }).join("") + '</div>'
        + '</article>';
      }

      function renderCard(service, bulkUpdating) {
        const stateClass = service.state === "running" ? "running"
          : service.state === "exited" || service.state === "dead" ? "stopped" : "other";
        return '<div class="card" data-service="' + escapeHtml(service.id) + '">'
          + '<div class="card-head">'
            + '<div class="service-title">' + renderServiceIcon(service)
            + '<div class="service-details"><div class="card-name">' + escapeHtml(service.displayName || service.name) + '</div>'
            + '<div class="card-role">' + escapeHtml(service.role) + '</div></div></div>'
            + '<div class="card-controls">'
              + '<button class="btn-card-icon btn-edit-compose" type="button"'
                + (service.composeEditorFiles?.length
                  ? ' data-path="' + escapeHtml(service.composeEditorFiles[0]) + '" data-paths="' + escapeHtml(JSON.stringify(service.composeEditorFiles)) + '" data-compose-service="' + escapeHtml(service.composeService || service.name) + '" title="Edit compose configuration" aria-label="Edit compose configuration for ' + escapeHtml(service.displayName || service.name) + '"'
                  : ' disabled title="Compose file is not exposed by COMPOSE_FILES_DIR" aria-label="Compose configuration is not exposed for editing"')
                + '>'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>'
              + '</button>'
              + '<div class="' + stateClass + '"><span class="dot"></span>' + escapeHtml(service.state) + '</div>'
            + '</div>'
          + '</div>'
          + (showImage ? '<div class="card-image">' + escapeHtml(service.image) + '</div>' : "")
          + renderUrls(service.routes)
          + (showPorts ? renderPorts(service.ports) : "")
          + renderFooter(service, bulkUpdating)
        + '</div>';
      }

      function renderServiceIcon(service) {
        const iconName = String(service.icon || service.name).toLowerCase();
        const baseUrl = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/";
        const isOverseer = iconName === "overseer"
          || String(service.image).includes("sbonnick/overseer")
          || service.labels["io.sbonnick.overseer.self"] === "true";
        const iconUrl = isOverseer
          ? "/assets/overseer.svg"
          : baseUrl + (service.icon ? "png/" + encodeURIComponent(iconName) : "svg/" + encodeURIComponent(iconName) + ".svg");
        const fallbackUrl = baseUrl + "svg/docker.svg";
        return '<img class="service-icon" src="' + iconUrl + '" alt="" aria-hidden="true"'
          + ' onerror="this.onerror=null;this.src=\'' + fallbackUrl + '\'">';
      }

      function renderUrls(routes) {
        if (!routes.length) return '<div class="subtle" style="font-size:13px">No Traefik routes</div>';
        const links = routes.flatMap(function(route) {
          return route.hostnames.map(function(host) {
            const url = routeUrl(host, route.tls);
            if (!url) return "";
            return '<div class="url"><a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">'
              + escapeHtml(host) + '</a></div>';
          });
        }).filter(Boolean).join("");
        if (!links) return '<div class="subtle" style="font-size:13px">No valid Traefik routes</div>';
        return '<div class="urls">' + links + '</div>';
      }

      function routeUrl(host, tls) {
        try {
          if (host !== host.trim()) return null;
          const url = new URL((tls ? "https" : "http") + "://" + host);
          const hostname = url.hostname;
          const validHostname = hostname === "localhost"
            || (hostname.startsWith("[") && hostname.endsWith("]"))
            || hostname.split(".").every(function(label) {
              return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label);
            });
          if (!hostname || !validHostname || url.username || url.password
            || url.pathname !== "/" || url.search || url.hash) return null;
          return url.href;
        } catch {
          return null;
        }
      }

      function renderPorts(ports) {
        if (!ports.length) return "";
        return '<div class="ports">' + ports.map(function(p) {
          return '<span class="port">' + escapeHtml(p) + '</span>';
        }).join("") + '</div>';
      }

      function renderFooter(service, bulkUpdating) {
        var update = service.update;
        if (!update) {
          return '<div class="card-footer"><span class="subtle" style="font-size:12px">Checking...</span></div>';
        }
        if (update.updating) {
          return '<div class="card-footer">'
            + '<span class="update-badge">Updating image...</span>'
            + '<button class="btn-update" disabled>Updating...</button>'
          + '</div>';
        }
        if (update.error) {
          return '<div class="card-footer"><span class="subtle" style="font-size:12px" title="'
            + escapeHtml(update.error) + '">Update check failed</span></div>';
        }
        if (update.hasUpdate) {
          return '<div class="card-footer">'
            + '<span class="update-badge">Update available</span>'
            + '<button class="btn-update" data-id="' + escapeHtml(service.id) + '" data-image="'
              + escapeHtml(service.image) + '"'
              + (bulkUpdating ? ' disabled' : '')
              + ' title="Pull this service image and recreate/restart only this container; compose file changes are not applied">Update image</button>'
          + '</div>';
        }
        return '<div class="card-footer"><span class="update-badge up-to-date">Up to date</span></div>';
      }

      projectsEl.addEventListener("click", async function(e) {
        const editComposeBtn = e.target.closest(".btn-edit-compose");
        if (editComposeBtn && !editComposeBtn.disabled) {
          if (isSaving) {
            alert("Wait for the current save to finish before opening another configuration.");
            return;
          }
          const path = editComposeBtn.dataset.path;
          const servicePaths = JSON.parse(editComposeBtn.dataset.paths);
          const serviceName = editComposeBtn.dataset.composeService;
          let discardConfirmed = false;
          if (servicePaths.includes(currentFilePath)) {
            setEditorOpen(true);
            const requestId = ++locateServiceRequest;
            const content = composeTextarea.value;
            const response = await fetch("/api/compose-files/locate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ content, path: currentFilePath, service: serviceName })
            });
            const data = await readJson(response);
            if (!response.ok) {
              alert(data.error || "Unable to locate service configuration");
              return;
            }
            if (requestId !== locateServiceRequest || !servicePaths.includes(currentFilePath)
              || composeTextarea.value !== content || !composeEditor.classList.contains("open")) return;
            if (Number.isInteger(data.offset)) {
              revealComposeService(data.offset);
              return;
            }
            if (composeTextarea.value !== lastSavedContent) {
              if (!confirm("Discard unsaved changes?")) return;
              discardConfirmed = true;
            }
          }
          if (!discardConfirmed && composeTextarea.value !== lastSavedContent
            && !confirm("Discard unsaved changes?")) return;
          setEditorOpen(true);
          await openComposeFile(path, serviceName, servicePaths);
          return;
        }

        const updateProjectBtn = e.target.closest(".btn-update-project");
        if (updateProjectBtn && !updateProjectBtn.disabled) {
          await updateProjectServices(updateProjectBtn.dataset.project);
          return;
        }

        const refreshBtn = e.target.closest(".btn-refresh-project");
        if (refreshBtn && !refreshBtn.disabled && !bulkUpdateProjects.size) {
          await refreshProject(refreshBtn);
          return;
        }

        const btn = e.target.closest(".btn-update");
        if (!btn || btn.disabled || bulkUpdateProjects.size) return;
        const service = currentProjects.flatMap(function(project) { return project.services; })
          .find(function(item) { return item.id === btn.dataset.id; });
        if (!service) return;
        btn.disabled = true;
        btn.textContent = "Updating...";

        try {
          const data = await updateService(service);
          btn.textContent = "Updated";
          btn.classList.add("success");
          if (service.isSelf && (data.retireContainerId || data.restartContainerId)) {
            await new Promise(function(resolve) { setTimeout(resolve, 500); });
            if (!await waitForOverseer()) throw new Error("Overseer did not become ready after updating");
          }
          if (pollTimer) clearTimeout(pollTimer);
          refresh();
        } catch (error) {
          // Updating Overseer briefly disconnects the proxy before its replacement is ready.
          if (service.isSelf && isTemporaryGatewayError(error)) {
            if (await waitForOverseer()) {
              refresh();
              return;
            }
            error = new Error("Overseer did not become ready after updating");
          }
          btn.disabled = false;
          btn.textContent = "Update image";
          alert("Update failed for " + service.image + ":\n" + error.message);
        }
      });

      async function updateService(service) {
        const response = await fetch("/api/services/" + encodeURIComponent(service.id) + "/update", {
          method: "POST",
          signal: AbortSignal.timeout(5 * 60 * 1000)
        });
        const data = await readJson(response);
        if (!response.ok) {
          const error = new Error(data.error || "Update failed");
          error.status = response.status;
          throw error;
        }
        return data;
      }

      async function updateServiceWhenAvailable(service) {
        const deadline = Date.now() + 5 * 60 * 1000;
        while (true) {
          try {
            return await updateService(service);
          } catch (error) {
            if (error.status !== 409 || Date.now() >= deadline) throw error;
            await new Promise(function(resolve) { setTimeout(resolve, 1000); });
          }
        }
      }

      async function updateProjectServices(projectName) {
        const project = currentProjects.find(function(item) { return item.name === projectName; });
        if (!project || bulkUpdateProjects.size) return;
        const services = project.services
          .filter(function(service) { return service.update?.hasUpdate && !service.update?.updating; })
          .toSorted(function(a, b) { return Number(Boolean(a.isSelf)) - Number(Boolean(b.isSelf)); });
        if (!services.length) return;

        if (pollTimer) clearTimeout(pollTimer);
        const progress = { completed: 0, total: services.length };
        const failures = [];
        const unconfirmed = [];
        let refreshError = "";
        bulkUpdateProjects.set(projectName, progress);
        render(currentProjects);

        for (const service of services) {
          try {
            const data = await updateServiceWhenAvailable(service);
            if (service.isSelf && (data.retireContainerId || data.restartContainerId)) {
              await new Promise(function(resolve) { setTimeout(resolve, 500); });
              if (!await waitForOverseer()) {
                const error = new Error("Overseer did not become ready after updating");
                error.uncertain = true;
                throw error;
              }
            }
          } catch (error) {
            if (error.uncertain || isTemporaryGatewayError(error)) {
              const ready = service.isSelf ? await waitForOverseer() : true;
              unconfirmed.push({
                service,
                error: new Error(ready
                  ? "Update result could not be confirmed"
                  : "Overseer did not become ready after updating")
              });
            } else {
              failures.push({ service, error });
            }
          }
          progress.completed += 1;
          render(currentProjects);
        }

        bulkUpdateProjects.delete(projectName);
        const refreshDeadline = Date.now() + 35000;
        while (isRefreshing && Date.now() < refreshDeadline) {
          await new Promise(function(resolve) { setTimeout(resolve, 100); });
        }
        if (isRefreshing) {
          refreshError = "Project status refresh timed out.";
        }
        if (pollTimer) clearTimeout(pollTimer);
        if (!isRefreshing) await refresh();
        if (failures.length || unconfirmed.length || refreshError) {
          const confirmed = services.length - failures.length - unconfirmed.length;
          alert("Confirmed " + confirmed + " of " + services.length + " container updates."
            + (unconfirmed.length ? " Unconfirmed:\n" : "\n")
            + unconfirmed.map(function(result) {
              return (result.service.displayName || result.service.name) + ": " + result.error.message;
            }).join("\n")
            + (failures.length ? (unconfirmed.length ? "\nFailed:\n" : "Failed:\n") : "")
            + failures.map(function(failure) {
              return (failure.service.displayName || failure.service.name) + ": " + failure.error.message;
            }).join("\n") + (refreshError ? "\n" + refreshError : ""));
        }
      }

      async function refreshProject(btn) {
        const project = btn.dataset.project;
        btn.disabled = true;
        btn.textContent = "Refreshing...";
        setRefreshOverlay(true);

        try {
          const response = await fetch("/api/projects/" + encodeURIComponent(project) + "/refresh", {
            method: "POST"
          });
          const data = await readJson(response);
          if (!response.ok) throw new Error(data.error || "Refresh failed");
          btn.textContent = "Refreshed";
          btn.classList.add("active");
          if (pollTimer) clearTimeout(pollTimer);
          setRefreshOverlay(false);
          refresh();
        } catch (error) {
          if (isTemporaryGatewayError(error)) {
            if (await waitForOverseer()) {
              setRefreshOverlay(false);
              refresh();
              return;
            }
            error = new Error("Overseer did not become ready after applying compose changes");
          }
          setRefreshOverlay(false);
          btn.disabled = false;
          btn.textContent = "Apply compose changes";
          alert("Refresh failed for " + project + ":\n" + error.message);
        }
      }

      filesToggle.addEventListener("click", function() {
        setEditorOpen(true);
      });

      fileMenuToggle.addEventListener("click", function() {
        setFileMenuOpen(!composeEditor.classList.contains("files-open"));
      });
      fileBackdrop.addEventListener("click", function() { setFileMenuOpen(false); });
      closeEditor.addEventListener("click", closeComposeEditor);

      composeEditor.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && e.target !== composeTextarea && composeEditor.classList.contains("files-open")) {
          e.preventDefault();
          setFileMenuOpen(false);
          fileMenuToggle.focus();
          return;
        }
        if (e.key !== "Tab" || e.defaultPrevented) return;
        const focusable = Array.from(composeEditor.querySelectorAll("button:not(:disabled), textarea:not(:disabled)"))
          .filter(function(element) { return !element.closest("[inert]") && element.tabIndex !== -1; });
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });

      statusEl.addEventListener("click", function() {
        if (pollTimer) clearTimeout(pollTimer);
        refresh(true);
      });

      portsToggle.addEventListener("click", function() {
        showPorts = !showPorts;
        portsToggle.setAttribute("aria-checked", String(showPorts));
        render(currentProjects);
      });

      imageToggle.addEventListener("click", function() {
        showImage = !showImage;
        imageToggle.setAttribute("aria-checked", String(showImage));
        render(currentProjects);
      });

      fileList.addEventListener("click", function(e) {
        const item = e.target.closest(".file-item");
        if (!item) return;
        if (isSaving) {
          alert("Wait for the current save to finish before opening another file.");
          return;
        }
        if (composeTextarea.value !== lastSavedContent && !confirm("Discard unsaved changes?")) {
          return;
        }
        openComposeFile(item.dataset.path);
      });

      composeTextarea.addEventListener("input", function() {
        renderHighlight();
        setDirty(composeTextarea.value !== lastSavedContent);
      });

      composeTextarea.addEventListener("scroll", syncHighlightScroll);
      composeTextarea.addEventListener("blur", function() {
        tabMovesFocus = false;
      });
      window.addEventListener("resize", function() {
        renderHighlight();
      });

      editorTools.addEventListener("click", function(e) {
        const button = e.target.closest("button");
        if (!button || button.disabled) return;
        if (button === wrapLines) {
          setLineWrapping(button.getAttribute("aria-pressed") !== "true");
          return;
        }
        changeIndent(button.dataset.editorAction === "outdent");
      });

      composeTextarea.addEventListener("keydown", function(e) {
        if (e.key === "Escape") {
          tabMovesFocus = true;
          return;
        }
        if (e.key === "Tab") {
          if (tabMovesFocus) {
            tabMovesFocus = false;
            return;
          }
          e.preventDefault();
          changeIndent(e.shiftKey);
        } else {
          tabMovesFocus = false;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveComposeFile();
        }
      });

      saveFile.addEventListener("click", saveComposeFile);
      window.addEventListener("beforeunload", function(e) {
        if (composeTextarea.value === lastSavedContent) return;
        e.preventDefault();
        e.returnValue = "";
      });

      function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, function(char) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
        });
      }

      if (mobileEditorQuery.matches) setLineWrapping(true);
      refresh();
    </script>
  </body>
</html>`;
