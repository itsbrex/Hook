import { readFileSync } from "node:fs";
import type { HookCliSpec, HookSubcommand } from "./specTypes.js";

export function loadHookCliSpec(specPath: string): HookCliSpec {
  return JSON.parse(readFileSync(specPath, "utf8")) as HookCliSpec;
}

function optionToProperty(opt: HookSubcommand["options"][number]): [string, Record<string, unknown>] {
  const key = (opt.long ?? opt.short ?? "").replace(/^-+/, "").replace(/-/g, "_");
  return [key, { type: "boolean", description: opt.description }];
}

function buildRequestSchema(sub: HookSubcommand): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const usage = sub.usage;

  // Positional args inferred from usage line (uppercase tokens after subcommand name).
  const positional = usage.match(/\b[A-Z_]{2,}\b/g) ?? [];
  for (const token of positional) {
    const key = token.toLowerCase();
    properties[key] = { type: "string", description: `Positional: ${token}` };
  }

  for (const opt of sub.options) {
    const [key, schema] = optionToProperty(opt);
    if (key) properties[key] = schema;
  }

  return {
    type: "object",
    properties,
    required: positional.filter((p) => !/^\[.+\]$/.test(p)).map((p) => p.toLowerCase()),
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
