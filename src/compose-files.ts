import type { Dirent } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type ComposeFileSummary = {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
};

export type ComposeFileContent = ComposeFileSummary & {
  content: string;
};

const COMPOSE_FILE_MATCH = /(^|[-_.])(docker-)?compose(?:[-_.][^/]*)?\.(?:ya?ml|json)$/i;
const MAX_FILE_BYTES = 1024 * 1024;

export async function listComposeFiles(rootDir: string): Promise<ComposeFileSummary[]> {
  const root = path.resolve(rootDir);
  const files: ComposeFileSummary[] = [];
  await walkComposeFiles(root, root, files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readComposeFile(
  rootDir: string,
  relativePath: string,
): Promise<ComposeFileContent> {
  const filePath = resolveComposePath(rootDir, relativePath);
  const info = await getComposeFileInfo(path.resolve(rootDir), filePath);
  const content = await readFile(filePath, "utf8");
  return { ...info, content };
}

export async function writeComposeFile(
  rootDir: string,
  relativePath: string,
  content: string,
): Promise<ComposeFileSummary> {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw new Error("Compose file is too large to save");
  }

  const filePath = resolveComposePath(rootDir, relativePath);
  await assertComposeFile(path.resolve(rootDir), filePath);
  await writeFile(filePath, content, "utf8");
  return getComposeFileInfo(path.resolve(rootDir), filePath);
}

async function walkComposeFiles(
  root: string,
  dir: string,
  files: ComposeFileSummary[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error) && dir === root) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkComposeFiles(root, entryPath, files);
      continue;
    }

    if (entry.isFile() && isComposeFile(entry.name)) {
      files.push(await getComposeFileInfo(root, entryPath));
    }
  }
}

async function getComposeFileInfo(root: string, filePath: string): Promise<ComposeFileSummary> {
  await assertComposeFile(root, filePath);
  const stats = await stat(filePath);
  if (stats.size > MAX_FILE_BYTES) {
    throw new Error("Compose file is too large to open");
  }

  const relativePath = path.relative(root, filePath);
  return {
    path: relativePath,
    name: path.basename(filePath),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

async function assertComposeFile(root: string, filePath: string): Promise<void> {
  if (!isPathInside(root, filePath)) {
    throw new Error("File path is outside the compose files directory");
  }
  if (!isComposeFile(path.basename(filePath))) {
    throw new Error("Only Docker Compose YAML or JSON files can be edited");
  }

  const stats = await stat(filePath);
  if (!stats.isFile()) {
    throw new Error("Compose path is not a file");
  }
}

function resolveComposePath(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const filePath = path.resolve(root, relativePath);
  if (!isPathInside(root, filePath)) {
    throw new Error("File path is outside the compose files directory");
  }

  return filePath;
}

function isPathInside(root: string, filePath: string): boolean {
  const relativePath = path.relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function isComposeFile(fileName: string): boolean {
  return COMPOSE_FILE_MATCH.test(fileName);
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
