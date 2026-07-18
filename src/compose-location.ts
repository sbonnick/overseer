export function findComposeServiceOffset(
  content: string,
  filePath: string,
  serviceName: string,
): number | undefined {
  if (!serviceName) return undefined;
  return /\.json$/i.test(filePath)
    ? findJsonServiceOffset(content, serviceName)
    : findYamlServiceOffset(content, serviceName);
}

function findYamlServiceOffset(content: string, serviceName: string): number | undefined {
  const lines = content.split("\n");
  let offset = 0;
  let rootIndent: number | undefined;
  let servicesIndent: number | undefined;
  let serviceIndent: number | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const code = stripYamlComment(line);
    const singleLineKey = parseYamlKey(code);
    const multilineKey = singleLineKey ? undefined : parseMultilineYamlKey(lines, lineIndex);
    const key = singleLineKey ?? multilineKey?.key;
    const indent = line.length - line.trimStart().length;

    if (servicesIndent === undefined) {
      if (key) {
        rootIndent = Math.min(rootIndent ?? indent, indent);
        if (key.name === "services" && indent === rootIndent) {
          const flowStart = code.slice(key.end).search(/\S/);
          if (flowStart >= 0 && code[key.end + flowStart] === "{") {
            return findYamlFlowProperty(content, offset + key.end + flowStart, serviceName);
          }
          servicesIndent = indent;
        }
      }
    } else if (code.trim()) {
      if (indent <= servicesIndent) return undefined;
      if (key) {
        serviceIndent ??= indent;
        if (indent === serviceIndent && key.name === serviceName) {
          return offset + key.offset;
        }
      }
    }

    const consumedLines = multilineKey?.consumedLines ?? 0;
    for (let consumed = 0; consumed <= consumedLines; consumed += 1) {
      offset += (lines[lineIndex + consumed]?.length ?? 0) + 1;
    }
    lineIndex += consumedLines;
  }

  return undefined;
}

function parseMultilineYamlKey(
  lines: string[],
  startLine: number,
): { key: { name: string; offset: number; end: number }; consumedLines: number } | undefined {
  const firstLine = lines[startLine] ?? "";
  const indent = firstLine.length - firstLine.trimStart().length;
  if (!firstLine.trimStart().startsWith('"') || !firstLine.trimEnd().endsWith("\\"))
    return undefined;

  let combined = firstLine.trimEnd().slice(0, -1);
  for (let lineIndex = startLine + 1; lineIndex < lines.length; lineIndex += 1) {
    const continuation = (lines[lineIndex] ?? "").trimStart();
    const continues = continuation.trimEnd().endsWith("\\");
    combined += continues ? continuation.trimEnd().slice(0, -1) : continuation;
    const key = parseYamlKey(combined);
    if (key) return { key: { ...key, offset: indent }, consumedLines: lineIndex - startLine };
    if (!continues) return undefined;
  }
  return undefined;
}

function stripYamlComment(line: string): string {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote === '"' && char === "\\") {
      index += 1;
    } else if (char === quote) {
      quote = "";
    } else if (!quote && (char === '"' || char === "'")) {
      quote = char;
    } else if (!quote && char === "#" && (index === 0 || /\s/.test(line[index - 1] ?? ""))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseYamlKey(line: string): { name: string; offset: number; end: number } | undefined {
  let cursor = 0;
  while (/\s/.test(line[cursor] ?? "")) cursor += 1;
  const offset = cursor;
  if (cursor >= line.length) return undefined;

  let name = "";
  if (line[cursor] === '"' || line[cursor] === "'") {
    const quote = line[cursor];
    const start = cursor;
    cursor += 1;
    while (cursor < line.length) {
      if (quote === '"' && line[cursor] === "\\") {
        cursor += 2;
      } else if (line[cursor] === quote) {
        if (quote === "'" && line[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        cursor += 1;
        break;
      } else {
        cursor += 1;
      }
    }
    if (line[cursor - 1] !== quote) return undefined;
    name = decodeYamlQuotedKey(line.slice(start, cursor), quote);
  } else {
    const start = cursor;
    while (cursor < line.length && line[cursor] !== ":") cursor += 1;
    name = line.slice(start, cursor).trimEnd();
  }

  while (/\s/.test(line[cursor] ?? "")) cursor += 1;
  if (!name || line[cursor] !== ":") return undefined;
  return { name, offset, end: cursor + 1 };
}

function decodeYamlQuotedKey(value: string, quote: string): string {
  if (quote === "'") return value.slice(1, -1).replace(/''/g, "'");
  const escapes: Record<string, string> = {
    "0": "\0",
    a: "\x07",
    b: "\b",
    t: "\t",
    n: "\n",
    v: "\v",
    f: "\f",
    r: "\r",
    e: "\x1b",
    " ": " ",
    '"': '"',
    "/": "/",
    "\\": "\\",
    N: "\u0085",
    _: "\u00a0",
    L: "\u2028",
    P: "\u2029",
  };
  const inner = value.slice(1, -1);
  let decoded = "";
  for (let index = 0; index < inner.length; index += 1) {
    if (inner[index] !== "\\") {
      decoded += inner[index];
      continue;
    }
    const escapeCode = inner[++index] ?? "";
    if (escapeCode === "\n") {
      while (/\s/.test(inner[index + 1] ?? "")) index += 1;
      continue;
    }
    const hexLength = escapeCode === "x" ? 2 : escapeCode === "u" ? 4 : escapeCode === "U" ? 8 : 0;
    if (hexLength) {
      const hex = inner.slice(index + 1, index + 1 + hexLength);
      if (!new RegExp(`^[0-9a-f]{${hexLength}}$`, "i").test(hex)) return "";
      const codePoint = Number.parseInt(hex, 16);
      if (codePoint > 0x10ffff) return "";
      decoded += String.fromCodePoint(codePoint);
      index += hexLength;
    } else if (escapeCode in escapes) {
      decoded += escapes[escapeCode];
    } else {
      return "";
    }
  }
  return decoded;
}

function findYamlFlowProperty(
  content: string,
  objectOffset: number,
  propertyName: string,
): number | undefined {
  let depth = 0;
  let squareDepth = 0;
  let expectKey = false;
  for (let index = objectOffset; index < content.length; index += 1) {
    const char = content[index];
    if (char === "#" && (index === 0 || /\s/.test(content[index - 1] ?? ""))) {
      while (index < content.length && content[index] !== "\n") index += 1;
    } else if (char === "{") {
      depth += 1;
      if (depth === 1) expectKey = true;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return undefined;
    } else if (char === "[") {
      squareDepth += 1;
    } else if (char === "]") {
      squareDepth -= 1;
    } else if (depth === 1 && squareDepth === 0 && char === ",") {
      expectKey = true;
    } else if (depth === 1 && squareDepth === 0 && expectKey && !/\s/.test(char ?? "")) {
      const key = parseYamlKey(content.slice(index));
      if (!key) return undefined;
      if (key.name === propertyName) return index + key.offset;
      expectKey = false;
      index += key.end - 1;
    } else if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      while (index < content.length) {
        if (quote === '"' && content[index] === "\\") index += 1;
        else if (content[index] === quote) break;
        index += 1;
      }
    }
  }
  return undefined;
}

function findJsonServiceOffset(content: string, serviceName: string): number | undefined {
  const rootOffset = content.indexOf("{");
  if (rootOffset < 0) return undefined;
  const services = findJsonProperty(content, rootOffset, "services");
  if (!services) return undefined;
  let servicesObject = services.valueOffset;
  while (/\s/.test(content[servicesObject] ?? "")) servicesObject += 1;
  if (content[servicesObject] !== "{") return undefined;
  return findJsonProperty(content, servicesObject, serviceName)?.keyOffset;
}

function findJsonProperty(
  content: string,
  objectOffset: number,
  propertyName: string,
): { keyOffset: number; valueOffset: number } | undefined {
  let depth = 0;
  for (let index = objectOffset; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"') {
      const keyOffset = index;
      index += 1;
      while (index < content.length && content[index] !== '"') {
        if (content[index] === "\\") index += 1;
        index += 1;
      }
      if (depth !== 1) continue;

      const rawString = content.slice(keyOffset, index + 1);
      let cursor = index + 1;
      while (/\s/.test(content[cursor] ?? "")) cursor += 1;
      if (content[cursor] !== ":") continue;
      try {
        if (JSON.parse(rawString) === propertyName) {
          return { keyOffset, valueOffset: cursor + 1 };
        }
      } catch {
        return undefined;
      }
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return undefined;
    }
  }
  return undefined;
}
