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
}

// Parse positional tokens from a usage line. Bracketed tokens (e.g. `[FILE]`)
// are marked optional; bare uppercase tokens (e.g. `FILE`) are required.
// The bracketed alternative comes first so `[FILE]` matches as a unit rather
// than leaking `FILE` to the bare-token branch.
export function extractPositionals(usage: string): Positional[] {
  const matches = usage.match(/\[[A-Z_]{2,}\]|\b[A-Z_]{2,}\b/g) ?? [];
  return matches.map((tok) => ({
    name: tok.replace(/^\[|\]$/g, ""),
    optional: tok.startsWith("["),
  }));
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

  return {
    type: "object",
    properties,
    required: positional.filter((p) => !p.optional).map((p) => p.name.toLowerCase()),
  };
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
            description: "CLI output",
            content: { "application/json": { schema: { type: "object", properties: { output: { type: "string" } } } } },
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
