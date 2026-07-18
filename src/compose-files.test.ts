import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  listComposeFiles,
  readComposeFile,
  resolveComposeEditorFiles,
  writeComposeFile,
} from "./compose-files";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("Compose JSON files", () => {
  test("lists, reads, and writes Compose JSON while ignoring unrelated JSON", async () => {
    root = await mkdtemp(path.join(tmpdir(), "overseer-compose-"));
    await writeFile(path.join(root, "compose.json"), '{"services":{}}');
    await writeFile(path.join(root, "settings.json"), "{}");
    await writeFile(path.join(root, "composer.json"), "{}");

    const files = await listComposeFiles(root);
    expect(files.map((file) => file.path)).toEqual(["compose.json"]);
    expect((await readComposeFile(root, "compose.json")).content).toBe('{"services":{}}');

    await writeComposeFile(root, "compose.json", '{"services":{"web":{}}}');
    expect((await readComposeFile(root, "compose.json")).content).toBe('{"services":{"web":{}}}');
  });
});

describe("Compose editor path mapping", () => {
  test("maps exact host config paths to editor-relative paths", () => {
    expect(
      resolveComposeEditorFiles(
        "/root/project",
        [{ source: "/srv/compose", destination: "/root/project" }],
        "/srv/compose/stack",
        ["compose.yml", "/srv/compose/other/compose.yml", "/elsewhere/compose.yml"],
      ),
    ).toEqual(["stack/compose.yml", "other/compose.yml"]);
  });

  test("does not guess by basename or resolve relative files without a working directory", () => {
    expect(
      resolveComposeEditorFiles(
        "/root/project",
        [{ source: "/srv/compose", destination: "/root/project" }],
        undefined,
        ["compose.yml", "/elsewhere/compose.yml"],
      ),
    ).toEqual([]);
  });

  test("uses the most specific mapping for nested bind mounts", () => {
    expect(
      resolveComposeEditorFiles(
        "/root/project",
        [
          { source: "/srv/compose", destination: "/root/project" },
          { source: "/opt/overrides", destination: "/root/project/stack" },
        ],
        "/opt/overrides",
        ["compose.override.yml"],
      ),
    ).toEqual(["stack/compose.override.yml"]);
  });

  test("rejects files shadowed by a nested bind mount", () => {
    expect(
      resolveComposeEditorFiles(
        "/root/project",
        [
          { source: "/srv/compose", destination: "/root/project" },
          { source: "/opt/overrides", destination: "/root/project/stack" },
        ],
        "/srv/compose/stack",
        ["compose.yml"],
      ),
    ).toEqual([]);
  });
});
