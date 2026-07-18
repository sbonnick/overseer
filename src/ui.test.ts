import { describe, expect, test } from "bun:test";
import { page } from "./ui";

describe("compose editor", () => {
  test("uses a full-screen native scroll area", () => {
    expect(page).toContain("position: fixed; inset: 0; z-index: 20");
    expect(page).toContain("grid-template-rows: var(--editor-bar-height) minmax(0, 1fr)");
    expect(page).toContain("height: 100%; min-height: 0; overflow: hidden");
    expect(page).toContain("overflow: auto; scrollbar-gutter: stable");
    expect(page).toContain('composeTextarea.addEventListener("scroll", syncHighlightScroll)');
    expect(page).not.toContain("composeTextarea.style.height");
  });

  test("provides an icon toolbar and file drawer", () => {
    expect(page).toContain('id="fileMenuToggle"');
    expect(page).toContain('id="closeEditor"');
    expect(page).toContain('aria-label="Save file"');
    expect(page).toContain("Press Escape, then Tab to move focus out of the editor.");
    expect(page).toContain('data-editor-action="outdent"');
    expect(page).toContain('data-editor-action="indent"');
    expect(page).toContain('id="wrapLines"');
    expect(page).toContain("font-size: 16px");
    expect(page).toContain("if (mobileEditorQuery.matches) setLineWrapping(true)");
  });

  test("highlights YAML and JSON", () => {
    expect(page).toContain("function highlightYaml(value)");
    expect(page).toContain("function highlightJson(value)");
    expect(page).toContain('"Docker Compose JSON editor"');
    expect(page).toContain('class="syntax-number"');
  });

  test("updates all eligible project services sequentially", () => {
    expect(page).toContain('class="btn btn-update-project"');
    expect(page).toContain("function updateProjectServices(projectName)");
    expect(page).toContain("for (const service of services)");
    expect(page).toContain("Number(Boolean(a.isSelf)) - Number(Boolean(b.isSelf))");
  });

  test("opens a container's mapped Compose configuration", () => {
    expect(page).toContain('class="btn-card-icon btn-edit-compose"');
    expect(page).toContain('aria-label="Compose configuration is not exposed for editing"');
    expect(page).toContain("await openComposeFile(path, serviceName, servicePaths)");
    expect(page).toContain('"/api/compose-files/service-content"');
    expect(page).toContain("function revealComposeService(offset)");
  });

  test("contains valid editor script syntax", () => {
    const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(() => new Function(script ?? "")).not.toThrow();
  });
});
