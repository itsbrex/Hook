import { readFileSync } from "node:fs";
import type { HookCliSpec, HookSubcommand } from "./specTypes.js";

export function loadHookCliSpec(specPath: string): HookCliSpec {
  return JSON.parse(readFileSync(specPath, "utf8")) as HookCliSpec;
}

function optionToProperty(opt: HookSubcommand["options"][number]): [string, Record<string, unknown>] {
  const key = (opt.long ?? opt.short ?? "").replace(/^-+/, "").replace(/-/g, "_");
  const type = opt.valueArg ? "string" : "boolean";
  const description = opt.valueArg ? `${opt.description} (value: ${opt.valueArg})` : opt.description;
  return [key, { type, description }];
}

export interface Positional {
  name: string;
  optional: boolean;
  variadic: boolean;
}

// Parse positional tokens from a usage line. Bracketed tokens ([FILE]) are
// optional; bare uppercase tokens are required. A trailing `...` marks the
// token as variadic (one or more). Order in the usage string is preserved.
export function extractPositionals(usage: string): Positional[] {
  const matches = usage.match(/\[[A-Z_]{2,}\](?:\.\.\.)?|\b[A-Z_]{2,}(?:\.\.\.)?/g) ?? [];
  return matches.map((tok) => {
    const variadic = tok.endsWith("...");
    const stripped = variadic ? tok.slice(0, -3) : tok;
    return {
      name: stripped.replace(/^\[|\]$/g, ""),
      optional: stripped.startsWith("["),
      variadic,
    };
  });
}

const VERBOSE_BOOKMARK_ARRAY_SCHEMA: Record<string, unknown> = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string", nullable: true },
      address: { type: "string", nullable: true },
      path: { type: "string", nullable: true },
      hooked: { type: "array", items: { type: "string" } },
    },
  },
};

function supportsJsonFlag(subName: string): boolean {
  return subName === "list" || subName === "find";
}

function buildRequestSchema(sub: HookSubcommand): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const positional = extractPositionals(sub.usage);

  for (const p of positional) {
    properties[p.name.toLowerCase()] = { type: "string", description: `Positional: ${p.name}` };
  }

  for (const opt of sub.options) {
    const [key, schema] = optionToProperty(opt);
    if (key) properties[key] = schema;
  }

  // Phase 4.3: expose `json=true` flag for list/find so callers know it's available.
  if (supportsJsonFlag(sub.name)) {
    properties.json = {
      type: "boolean",
      description:
        "When true, bridge forces --output_format=verbose and post-processes stdout into VerboseBookmark[] (name, address, path, hooked).",
    };
  }

  return {
    type: "object",
    properties,
    required: positional.filter((p) => !p.optional).map((p) => p.name.toLowerCase()),
  };
}

function buildResponseSchema(sub: HookSubcommand): Record<string, unknown> {
  if (supportsJsonFlag(sub.name)) {
    return {
      type: "object",
      properties: {
        output: {
          oneOf: [{ type: "string" }, VERBOSE_BOOKMARK_ARRAY_SCHEMA],
        },
      },
    };
  }
  return { type: "object", properties: { output: { type: "string" } } };
}

export interface OpenApiDocument {
  openapi: "3.0.3";
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string }>;
  paths: Record<string, { post: Record<string, unknown> }>;
}

export function generateOpenApiSpec(baseUrl: string, spec: HookCliSpec): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  for (const sub of spec.subcommands) {
    paths[`/${sub.name}`] = {
      post: {
        operationId: sub.name,
        tags: ["hook"],
        summary: sub.description,
        description: sub.usage,
        requestBody: {
          required: true,
          content: { "application/json": { schema: buildRequestSchema(sub) } },
        },
        responses: {
          "200": {
            description:
              "CLI output (string) or structured records (array when json=true — list/find only)",
            content: { "application/json": { schema: buildResponseSchema(sub) } },
          },
        },
      },
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Hookmark CLI",
      version: spec.hookVersion ?? "0.0.0",
      description: "Generated from `hook help <subcmd>` output",
    },
    servers: [{ url: baseUrl }],
    paths,
  };
}
