import { describe, expect, test } from "bun:test";
import { page } from "./ui";

describe("compose editor", () => {
  test("uses a bounded native scroll area", () => {
    expect(page).toContain("height: clamp(320px, 62dvh, 720px)");
    expect(page).toContain("overflow: auto; scrollbar-gutter: stable");
    expect(page).toContain('composeTextarea.addEventListener("scroll", syncHighlightScroll)');
    expect(page).not.toContain("composeTextarea.style.height");
  });

  test("provides touch-friendly mobile editing controls", () => {
    expect(page).toContain('aria-label="Docker Compose YAML editor"');
    expect(page).toContain("Press Escape, then Tab to move focus out of the editor.");
    expect(page).toContain('data-editor-action="outdent"');
    expect(page).toContain('data-editor-action="indent"');
    expect(page).toContain('id="wrapLines"');
    expect(page).toContain("font-size: 16px");
    expect(page).toContain("min-height: 44px");
    expect(page).toContain("if (mobileEditorQuery.matches) setLineWrapping(true)");
  });

  test("contains valid editor script syntax", () => {
    const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(() => new Function(script ?? "")).not.toThrow();
  });
});
