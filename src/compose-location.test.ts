import { describe, expect, test } from "bun:test";
import { findComposeServiceOffset } from "./compose-location";

describe("Compose service location", () => {
  test("finds a direct YAML service without matching nested keys", () => {
    const content = `name: example
services:
  api:
    image: example/api
    labels:
      worker: nested
  worker:
    image: example/worker
`;
    const offset = findComposeServiceOffset(content, "compose.yml", "worker");
    expect(offset).toBe(content.indexOf("worker:\n    image"));
  });

  test("supports quoted YAML service names and comments", () => {
    const content = `services: # application services
  "web-api":
    image: "example/#latest"
`;
    expect(findComposeServiceOffset(content, "compose.yaml", "web-api")).toBe(
      content.indexOf('"web-api"'),
    );
  });

  test("ignores nested services keys and supports YAML hex escapes", () => {
    const content = `x-template:
  services:
    web-api:
      image: wrong
services:
  "web\\x2dapi":
    image: right
`;
    expect(findComposeServiceOffset(content, "compose.yml", "web-api")).toBe(
      content.indexOf('"web\\x2dapi"'),
    );
  });

  test("supports flow-style YAML service maps", () => {
    const content = "services: { api: { image: example/api }, web: { image: example/web } }";
    expect(findComposeServiceOffset(content, "compose.yml", "web")).toBe(content.indexOf("web:"));
  });

  test("supports flow comments and eight-digit YAML escapes", () => {
    const content = `services: {
  api: {}, # ignored } punctuation
  "web\\U0000002dapi": {}
}`;
    expect(findComposeServiceOffset(content, "compose.yml", "web-api")).toBe(
      content.indexOf('"web\\U0000002dapi"'),
    );
  });

  test("supports escaped multiline YAML service keys", () => {
    const content = `services:
  "web\\
    -api": {}
`;
    expect(findComposeServiceOffset(content, "compose.yml", "web-api")).toBe(
      content.indexOf('"web\\'),
    );
  });

  test("does not consume a complete key whose value ends in a backslash", () => {
    const content = `"x-note": value\\
services:
  web:
    image: web
`;
    expect(findComposeServiceOffset(content, "compose.yml", "web")).toBe(content.indexOf("web:\n"));
  });

  test("supports escaped multiline keys in flow-style maps", () => {
    const content = `services: { "web\\
    -api": {} }`;
    expect(findComposeServiceOffset(content, "compose.yml", "web-api")).toBe(
      content.indexOf('"web\\'),
    );
  });

  test("finds a direct JSON service without matching nested properties", () => {
    const content = JSON.stringify(
      { services: { api: { labels: { worker: "nested" } }, worker: { image: "example/worker" } } },
      null,
      2,
    );
    expect(findComposeServiceOffset(content, "compose.json", "worker")).toBe(
      content.lastIndexOf('"worker"'),
    );
  });

  test("returns undefined when the service is absent", () => {
    expect(
      findComposeServiceOffset("services:\n  api:\n    image: api\n", "compose.yml", "web"),
    ).toBeUndefined();
  });

  test("does not search beyond a non-object JSON services value", () => {
    expect(
      findComposeServiceOffset('{"services":null,"other":{"web":{}}}', "compose.json", "web"),
    ).toBeUndefined();
  });

  test("handles long colon-free YAML lines in linear time", () => {
    const content = `${"x".repeat(200_000)} \nservices:\n  web:\n    image: web\n`;
    expect(findComposeServiceOffset(content, "compose.yml", "web")).toBe(content.indexOf("web:\n"));
  });
});
