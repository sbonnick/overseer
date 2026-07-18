import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listComposeFiles, readComposeFile, writeComposeFile } from "./compose-files";

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
