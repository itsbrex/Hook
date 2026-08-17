// tests/manualBuilder.test.ts
import { describe, expect, it } from "vitest";
import { extractPositionals, generateOpenApiSpec } from "../src/manualBuilder";
import { mergeAppleScriptSubcommands } from "../src/applescript/merge";
import type { HookCliSpec, HookSubcommand } from "../src/specTypes";

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

  it("exposes timeoutMs with the configured default on every operation", () => {
    const openapi = generateOpenApiSpec(
      "http://127.0.0.1:3801",
      SPEC,
      90_000
    );
    const schema = openapi.paths["/clip"].post.requestBody.content[
      "application/json"
    ].schema;
    expect(schema.properties.timeoutMs).toEqual({
      type: "integer",
      minimum: 1,
      default: 90_000,
      description: expect.stringContaining("HOOK_TIMEOUT_MS"),
    });
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
    expect(Object.keys(schema.properties).sort()).toEqual([
      "json",
      "optional",
      "required",
      "timeoutMs",
    ]);
    expect(schema.required).toEqual(["required"]);
  });
});

describe("generateOpenApiSpec with list/find json option", () => {
  it("exposes json boolean property for list", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [{ name: "list", usage: "hook list [FILE_OR_URL]", description: "", options: [] }],
    };
    const api = generateOpenApiSpec("http://x", spec);
    const schema = (
      api.paths["/list"].post as {
        requestBody: {
          content: { "application/json": { schema: { properties: Record<string, { type: string; description: string }> } } };
        };
      }
    ).requestBody.content["application/json"].schema.properties;
    expect(schema.json).toEqual({
      type: "boolean",
      description: expect.stringContaining("VerboseBookmark"),
    });
  });

  it("exposes json boolean property for find", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [{ name: "find", usage: "hook find QUERY", description: "", options: [] }],
    };
    const api = generateOpenApiSpec("http://x", spec);
    const schema = (
      api.paths["/find"].post as {
        requestBody: {
          content: { "application/json": { schema: { properties: Record<string, { type: string; description: string }> } } };
        };
      }
    ).requestBody.content["application/json"].schema.properties;
    expect(schema.json).toEqual({
      type: "boolean",
      description: expect.stringContaining("VerboseBookmark"),
    });
  });

  it("does not add json property for other subcommands", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [{ name: "clip", usage: "hook clip FILE", description: "", options: [] }],
    };
    const api = generateOpenApiSpec("http://x", spec);
    const schema = (
      api.paths["/clip"].post as {
        requestBody: { content: { "application/json": { schema: { properties: Record<string, unknown> } } } };
      }
    ).requestBody.content["application/json"].schema.properties;
    expect(schema).not.toHaveProperty("json");
  });

  it("list response schema has oneOf for string and array output", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [{ name: "list", usage: "hook list [FILE_OR_URL]", description: "", options: [] }],
    };
    const api = generateOpenApiSpec("http://x", spec);
    const outputSchema = (
      api.paths["/list"].post as {
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { properties: { output: { oneOf: Array<Record<string, unknown>> } } };
              };
            };
          };
        };
      }
    ).responses["200"].content["application/json"].schema.properties.output;
    expect(outputSchema).toHaveProperty("oneOf");
    expect(outputSchema.oneOf.length).toBe(2);
  });

  it("find response schema has oneOf for string and array output", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [{ name: "find", usage: "hook find QUERY", description: "", options: [] }],
    };
    const api = generateOpenApiSpec("http://x", spec);
    const outputSchema = (
      api.paths["/find"].post as {
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { properties: { output: { oneOf: Array<Record<string, unknown>> } } };
              };
            };
          };
        };
      }
    ).responses["200"].content["application/json"].schema.properties.output;
    expect(outputSchema).toHaveProperty("oneOf");
    expect(outputSchema.oneOf.length).toBe(2);
  });

  it("other subcommand response output schema is plain string", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [{ name: "clip", usage: "hook clip FILE", description: "", options: [] }],
    };
    const api = generateOpenApiSpec("http://x", spec);
    const outputSchema = (
      api.paths["/clip"].post as {
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { properties: { output: { type?: string; oneOf?: unknown } } };
              };
            };
          };
        };
      }
    ).responses["200"].content["application/json"].schema.properties.output;
    expect(outputSchema.type).toBe("string");
    expect(outputSchema).not.toHaveProperty("oneOf");
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

describe("generateOpenApiSpec with osascript-source subcommands", () => {
  const jxaSub = (name: string): HookSubcommand => ({
    name,
    usage: `hookmark ${name}`,
    description: `${name} (JXA)`,
    options: [],
    source: "osascript",
    appleScriptSource: `(() => JSON.stringify(1))();`,
  });

  const cliSub = (name: string): HookSubcommand => ({
    name,
    usage: `hookmark ${name}`,
    description: `${name} (CLI)`,
    options: [],
  });

  it("includes both CLI and JXA subcommands in paths", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [
        cliSub("clip"),
        cliSub("list"),
        jxaSub("all_bookmarks"),
        jxaSub("count_bookmarks"),
        jxaSub("bookmark"),
      ],
    };
    const api = generateOpenApiSpec("http://x", spec);
    expect(Object.keys(api.paths).sort()).toEqual([
      "/all_bookmarks",
      "/bookmark",
      "/clip",
      "/count_bookmarks",
      "/list",
    ]);
  });

  it("produces the same POST operation shape for JXA as for CLI", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [cliSub("clip"), jxaSub("all_bookmarks")],
    };
    const api = generateOpenApiSpec("http://x", spec);
    const cli = api.paths["/clip"].post;
    const jxa = api.paths["/all_bookmarks"].post;
    expect(Object.keys(cli).sort()).toEqual(Object.keys(jxa).sort());
    expect((jxa as { operationId: string }).operationId).toBe("all_bookmarks");
    expect((jxa as { summary: string }).summary).toBe("all_bookmarks (JXA)");
    expect((jxa as { description: string }).description).toBe("hookmark all_bookmarks");
    expect(
      (
        jxa as {
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: { properties: { output: { type: string } } };
                };
              };
            };
          };
        }
      ).responses["200"].content["application/json"].schema.properties.output.type,
    ).toBe("string");
  });

  it("end-to-end: merging then generating OpenAPI produces all 15 JXA routes", () => {
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [],
    };
    mergeAppleScriptSubcommands(spec, false);
    const api = generateOpenApiSpec("http://x", spec);
    const jxaPaths = Object.keys(api.paths).sort();
    expect(jxaPaths.length).toBe(15);
    for (const expected of [
      "/all_bookmarks",
      "/bookmark",
      "/count_bookmarks",
      "/exists_bookmark",
      "/get_tags",
      "/set_tags",
      "/add_tags",
      "/remove_tags",
      "/bookmarks_with_tags",
      "/rename_bookmark",
      "/make_bookmark",
      "/hook_bookmarks",
      "/unhook_bookmarks",
      "/from_active_window",
      "/by_request_handle",
    ]) {
      expect(jxaPaths).toContain(expected);
    }
  });
});
