// tests/manualBuilder.test.ts
import { describe, expect, it } from "vitest";
import { extractPositionals, generateOpenApiSpec } from "../src/manualBuilder";
import type { HookCliSpec } from "../src/specTypes";

const SPEC: HookCliSpec = {
  generatedAt: "2026-04-20T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    {
      name: "clip",
      usage: "hook clip ITEM",
      description: "Generate a hook:// URL for ITEM.",
      options: [{ short: "-m", long: "--markdown", description: "Markdown link", valueArg: null }],
    },
  ],
};

describe("generateOpenApiSpec", () => {
  it("emits one POST path per subcommand with operationId == subcommand name", () => {
    const openapi = generateOpenApiSpec("http://127.0.0.1:3801", SPEC);
    expect(openapi.openapi).toBe("3.0.3");
    expect(openapi.servers[0].url).toBe("http://127.0.0.1:3801");
    expect(openapi.paths["/clip"].post.operationId).toBe("clip");
    expect(openapi.paths["/clip"].post.summary).toContain("Generate a hook:// URL");
    const schema = openapi.paths["/clip"].post.requestBody.content["application/json"].schema;
    expect(schema.type).toBe("object");
    expect(schema.properties.markdown).toEqual({ type: "boolean", description: "Markdown link" });
  });

  it("marks value-taking flags as string in the request schema", () => {
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        {
          name: "list",
          usage: "hook list [FILE_OR_URL]",
          description: "",
          options: [
            { short: "-o", long: "--output_format", description: "Output format", valueArg: "FORMAT" },
            { short: "-f", long: "--files_only", description: "Files only", valueArg: null },
          ],
        },
      ],
    };
    const openapi = generateOpenApiSpec("http://127.0.0.1:3801", spec);
    const schema = (openapi.paths["/list"].post as { requestBody: { content: { "application/json": { schema: { properties: Record<string, { type: string }> } } } } })
      .requestBody.content["application/json"].schema;
    expect(schema.properties.output_format.type).toBe("string");
    expect(schema.properties.files_only.type).toBe("boolean");
  });

  it("marks bracketed positionals as optional (not in required[])", () => {
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        { name: "list", usage: "hook list REQUIRED [OPTIONAL]", description: "", options: [] },
      ],
    };
    const openapi = generateOpenApiSpec("http://127.0.0.1:3801", spec);
    const schema = (openapi.paths["/list"].post as { requestBody: { content: { "application/json": { schema: { properties: Record<string, unknown>; required: string[] } } } } })
      .requestBody.content["application/json"].schema;
    expect(Object.keys(schema.properties).sort()).toEqual(["optional", "required"]);
    expect(schema.required).toEqual(["required"]);
  });
});

describe("extractPositionals", () => {
  it("distinguishes bare (required) and bracketed (optional) tokens", () => {
    expect(extractPositionals("hook foo FILE [DEST]")).toEqual([
      { name: "FILE", optional: false, variadic: false },
      { name: "DEST", optional: true, variadic: false },
    ]);
  });

  it("returns empty when no positionals are present", () => {
    expect(extractPositionals("hook version")).toEqual([]);
  });

  it("marks trailing ... as variadic, whether bare or bracketed", () => {
    expect(extractPositionals("hook link SOURCE... TARGET")).toEqual([
      { name: "SOURCE", optional: false, variadic: true },
      { name: "TARGET", optional: false, variadic: false },
    ]);
    expect(extractPositionals("hook list [FILE_OR_URL]...")).toEqual([
      { name: "FILE_OR_URL", optional: true, variadic: true },
    ]);
  });
});
