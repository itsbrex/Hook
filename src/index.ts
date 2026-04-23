#!/usr/bin/env node

/**
 * hookmark-mcp Code-Mode MCP Server
 *
 * A single MCP server that registers Hookmark CLI subcommands as UTCP tools
 * via a local HTTP bridge, then exposes them through Code-Mode's
 * call_tool_chain for batched TypeScript execution in an isolated sandbox.
 *
 * Pattern: mirrors @utcp/code-mode-mcp / brandjet-code-mode.
 */

import util from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { config as loadDotenv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import "@utcp/http";
import "@utcp/dotenv-loader";
import {
  CallTemplateSchema,
  ensureCorePluginsInitialized,
  UtcpClientConfigSerializer,
} from "@utcp/sdk";
import type { CallTemplate } from "@utcp/sdk";
import { CodeModeUtcpClient } from "@utcp/code-mode";
import { ContentBlockSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import type { HttpCallTemplate } from "@utcp/http";

import { getConfig } from "./config.js";
import { runHook } from "./hookCli.js";
import { loadHookCliSpec } from "./manualBuilder.js";
import { createBridgeServer, type BridgeServer } from "./bridge.js";
import { diffSpecs, renderChangelogHtml, openInBrowser } from "./changelog.js";
import { regenHookSpec } from "./regenSpec.js";
import { probeHookmark, runOsascript as runOsascriptRaw } from "./osascript.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log = (...args: unknown[]) =>
  process.stderr.write(util.format(...args) + "\n");
console.warn = (...args: unknown[]) =>
  process.stderr.write(util.format(...args) + "\n");

loadDotenv({ path: path.resolve(__dirname, "..", ".env") });
ensureCorePluginsInitialized();

export const TOOL_NAMES = [
  "register_manual",
  "deregister_manual",
  "search_tools",
  "list_tools",
  "changelog",
  "tools_info",
  "get_all_tool_interfaces",
  "get_required_keys_for_tool",
  "call_tool_chain",
] as const;

export function buildUsageGuide(): string {
  return [
    "## Hookmark Code-Mode Usage",
    "",
    "Discovery:",
    "1. `search_tools` with the user's task description to find relevant hook subcommands.",
    "2. `tools_info` to fetch the TypeScript interface for a given hook subcommand before using it.",
    "",
    "Execution (preferred):",
    "- Use `call_tool_chain` with a TypeScript snippet that calls `hook.<subcommand>({ body: {...} })`.",
    "- Examples:",
    "    return hook.clip({ body: { item: '/Users/me/note.md' } });",
    "    return hook.clip({ body: { item: '/a.md' } }).then((a) =>",
    "      hook.clip({ body: { item: '/b.md' } }).then((b) =>",
    "        hook.link({ body: { item_a: a.output, item_b: b.output } })",
    "      )",
    "    );",
    "",
    "Batch related work in a single `call_tool_chain` execution rather than many small tool calls.",
  ].join("\n");
}

const SPEC_PATH = path.resolve(__dirname, "..", "docs/reference/hook-cli-spec.json");
const PREVIOUS_PATH = path.resolve(
  __dirname,
  "..",
  "docs/reference/hook-cli-spec.previous.json"
);

let bridge: BridgeServer | null = null;
let bridgePort: number | null = null;
let utcpClient: CodeModeUtcpClient | null = null;
let cachedChangelogHtml = "<p>No changelog generated yet.</p>";

async function bootBridgeAndClient(): Promise<void> {
  if (utcpClient && bridge) return;

  const cfg = getConfig(process.env);

  // Regen spec (best-effort). Falls back to existing spec on failure.
  let spec;
  if (!cfg.skipRegen) {
    try {
      const result = regenHookSpec({
        hookCli: cfg.hookCli,
        specPath: SPEC_PATH,
        previousPath: PREVIOUS_PATH,
      });
      spec = result.spec;
      if (result.changed && result.previousRaw) {
        try {
          const prev = JSON.parse(result.previousRaw);
          const diff = diffSpecs(prev, spec);
          cachedChangelogHtml = renderChangelogHtml(diff, spec);
        } catch (e) {
          console.warn("[hook] Failed to render changelog:", e);
        }
      } else {
        cachedChangelogHtml = renderChangelogHtml(
          {
            addedSubcommands: [],
            removedSubcommands: [],
            changedSubcommands: [],
            hasChanges: false,
          },
          spec
        );
      }
    } catch (e) {
      console.warn("[hook] Regen failed, falling back to static spec:", e);
    }
  }
  if (!spec) {
    spec = loadHookCliSpec(SPEC_PATH);
  }

  // Probe Hookmark AppleScript capability; flip skipApplescript on failure so
  // we don't register AppleScript-backed subcommands when they can't run.
  if (!cfg.skipApplescript) {
    const probe = await probeHookmark();
    if (!probe.ok) {
      const hint =
        probe.reason === "permission"
          ? " — grant Automation permission: System Settings → Privacy & Security → Automation → <terminal app> → Hookmark"
          : probe.reason === "not_running"
            ? " — launch Hookmark.app to enable AppleScript-backed subcommands"
            : "";
      console.error(`[hook] AppleScript disabled: ${probe.reason}${hint}`);
      cfg.skipApplescript = true;
    }
  }

  // Start bridge server
  const runOsascriptAdapter = (script: string, args: string[]): string =>
    runOsascriptRaw(script, { args, language: "javascript" });

  bridge = createBridgeServer({
    spec,
    hookCli: cfg.hookCli,
    runHook,
    runOsascript: runOsascriptAdapter,
    getChangelogHtml: () => cachedChangelogHtml,
  });
  bridgePort = await bridge.listen(cfg.bridgePort);

  // Initialize UTCP client
  const rawConfig: Record<string, unknown> = {
    tool_repository: { tool_repository_type: "in_memory" },
    tool_search_strategy: {
      tool_search_strategy_type: "tag_and_description_word_match",
    },
  };
  const clientConfig = new UtcpClientConfigSerializer().validateDict(rawConfig);
  const client = await CodeModeUtcpClient.create(
    path.resolve(__dirname, ".."),
    clientConfig
  );

  const specUrl = `http://127.0.0.1:${bridgePort}/openapi`;
  try {
    await client.registerManual({
      name: "hook",
      call_template_type: "http",
      http_method: "GET",
      url: specUrl,
      content_type: "application/json",
    } as HttpCallTemplate);

    const tools = await client.config.tool_repository.getTools();
    const hookTools = tools.filter((t) =>
      (t as { name: string }).name.startsWith("hook.")
    );
    console.log(
      `[hook] Registered hook (${hookTools.length} tools) from bridge at :${bridgePort}`
    );
  } catch (err) {
    console.warn("[hook] Failed to register hook manual:", err);
  }

  const tools = await client.getTools();
  console.log(`[hook] Total tools discovered: ${tools.length}`);

  utcpClient = client;
}

async function getUtcpClient(): Promise<CodeModeUtcpClient> {
  if (!utcpClient) await bootBridgeAndClient();
  if (!utcpClient) throw new Error("UTCP client failed to initialize");
  return utcpClient;
}

// ---------------------------------------------------------------------------
// Identifier helpers (from code-mode-mcp reference)
// ---------------------------------------------------------------------------

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

function utcpNameToTsInterfaceName(utcpName: string): string {
  if (utcpName.includes(".")) {
    const parts = utcpName.split(".");
    const manualName = parts[0]!;
    const toolParts = parts.slice(1);
    const sanitizedManualName = sanitizeIdentifier(manualName);
    const toolName = toolParts
      .map((part) => sanitizeIdentifier(part))
      .join("_");
    return `${sanitizedManualName}.${toolName}`;
  }
  return sanitizeIdentifier(utcpName);
}

async function findToolByName(
  client: CodeModeUtcpClient,
  name: string
): Promise<{ tool: unknown; utcpName: string } | null> {
  const directTool = await client.config.tool_repository.getTool(name);
  if (directTool) return { tool: directTool, utcpName: name };

  const allTools = await client.config.tool_repository.getTools();
  for (const tool of allTools) {
    if (utcpNameToTsInterfaceName((tool as { name: string }).name) === name) {
      return { tool, utcpName: (tool as { name: string }).name };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// MCP Server + Tool Registration
// ---------------------------------------------------------------------------

const mcp = new McpServer(
  { name: "hookmark-mcp", version: "0.2.0" },
  { instructions: buildUsageGuide() }
);

function setupMcpTools(): void {
  // ── Prompt: usage guide ──────────────────────────────────────────────
  mcp.registerPrompt(
    "hook_codemode_usage",
    {
      title: "Hookmark Code-Mode Usage Guide",
      description:
        "How to use the Hookmark Code-Mode MCP server for executing TypeScript code against registered Hookmark CLI tools.",
    },
    async () => {
      const guide = `## Hookmark execution policy

You can access Hookmark data only through registered MCP Hookmark tools.

### Discovery and planning
1. Start with \`search_tools\` using the user's natural-language task to find relevant tools. You can pass optional \`tags\` (e.g. ["clip", "link", "list", "find", "remove", "clone", "from"]) to filter results by category.
2. Use \`list_tools\` to browse all available operations or find alternatives when search results are insufficient.
3. Use \`tools_info\` to inspect exact TypeScript interfaces (args and return types) before writing code.

### Execution strategy
- Prefer **one \`call_tool_chain\` execution** that performs all related steps end-to-end when feasible.
- In that TypeScript snippet, use \`hook.*\` calls with a \`body\` object (e.g. \`hook.clip({ body: { item: '/Users/me/note.md' } })\`).
- Avoid many small tool executions unless splitting is necessary (e.g., pagination checkpoints, error recovery, user-requested stepwise execution).

${CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE}

### Output policy
- Return **compact, decision-ready summaries** by default: counts, key fields, top-N examples, notable anomalies.
- Do **not** return full raw datasets unless the user explicitly asks for complete payloads.

### Sandbox runtime helpers
Inside \`call_tool_chain\`, you also have access to these introspection globals:
- \`__interfaces\` — string containing all TypeScript interface definitions for registered tools
- \`__getToolInterface(name)\` — get the TypeScript interface for a specific tool by name
- \`__availableTools\` — array of available tool access patterns (e.g. "hook.clip")

### Available tool categories
- \`hook.clip\` — Clip the current item to the Hookmark clipboard
- \`hook.link\` — Create a bidirectional link between two items
- \`hook.list\` — List hooks for a given item
- \`hook.find\` — Find items by URL or search term
- \`hook.remove\` — Remove a hook between items
- \`hook.clone\` — Clone hooks from one item to another
- \`hook.from\` — Hooks originating from a given item`;

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: guide },
          },
        ],
      };
    }
  );

  // ── register_manual ──────────────────────────────────────────────────
  mcp.registerTool(
    "register_manual",
    {
      title: "Register a UTCP Manual",
      description: "Registers a new tool provider by providing its call template.",
      inputSchema: {
        manual_call_template: CallTemplateSchema.describe(
          "The call template for the UTCP Manual endpoint."
        ),
      },
    },
    async (input: { manual_call_template: unknown }) => {
      const client = await getUtcpClient();
      try {
        const result = await client.registerManual(
          input.manual_call_template as CallTemplate
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: msg }),
            },
          ],
        };
      }
    }
  );

  // ── deregister_manual ────────────────────────────────────────────────
  mcp.registerTool(
    "deregister_manual",
    {
      title: "Deregister a UTCP Manual",
      description: "Deregisters a tool provider from the UTCP client.",
      inputSchema: {
        manual_name: z
          .string()
          .describe("The name of the manual to deregister."),
      },
    },
    async (input: { manual_name: string }) => {
      const client = await getUtcpClient();
      try {
        const success = await client.deregisterManual(input.manual_name);
        const message = success
          ? `Manual '${input.manual_name}' deregistered.`
          : `Manual '${input.manual_name}' not found.`;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success, message }),
            },
          ],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: msg }),
            },
          ],
        };
      }
    }
  );

  // ── search_tools ─────────────────────────────────────────────────────
  mcp.registerTool(
    "search_tools",
    {
      title: "Search for Hookmark Tools",
      description:
        "Searches for relevant tools across Hookmark CLI subcommands based on a task description. Optionally filter by tags (e.g. 'clip', 'link', 'find') to narrow results to a specific category.",
      inputSchema: {
        task_description: z
          .string()
          .describe("A natural language description of the task."),
        limit: z.number().optional().default(10),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "Optional list of tags to filter by. Results must have at least one of these tags."
          ),
      },
    },
    async (input: {
      task_description: string;
      limit?: number;
      tags?: string[];
    }) => {
      const client = await getUtcpClient();
      try {
        const tools = await client.searchTools(
          input.task_description,
          input.limit ?? 10,
          input.tags
        );
        const toolsWithInterfaces = tools.map((t) => ({
          name: utcpNameToTsInterfaceName(t.name),
          description: t.description,
          tags: t.tags,
          typescript_interface: client.toolToTypeScriptInterface(t),
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ tools: toolsWithInterfaces }),
            },
          ],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
        };
      }
    }
  );

  // ── list_tools ───────────────────────────────────────────────────────
  mcp.registerTool(
    "list_tools",
    {
      title: "List All Registered Hookmark Tools",
      description:
        "Returns a list of all tool names currently registered across Hookmark CLI subcommands.",
      inputSchema: {},
    },
    async () => {
      const client = await getUtcpClient();
      try {
        const tools = await client.config.tool_repository.getTools();
        const toolNames = tools.map((t) =>
          utcpNameToTsInterfaceName((t as { name: string }).name)
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ tools: toolNames }) },
          ],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: "text" as const, text: msg }],
        };
      }
    }
  );

  // ── changelog ────────────────────────────────────────────────────────
  mcp.registerTool(
    "changelog",
    {
      title: "Get Runtime Changelog + Browser URL",
      description:
        "Returns the live browser URL for the Hookmark spec changelog UI and opens it in the default browser when enabled.",
      inputSchema: {},
    },
    async () => {
      await getUtcpClient();
      const port = bridgePort;
      if (!port) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: "Bridge server is not initialized." },
          ],
        };
      }

      const baseUrl = `http://127.0.0.1:${port}`;
      await openInBrowser(`${baseUrl}/changelog`, {
        autoOpen: getConfig(process.env).changelogAutoOpen,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                bridge_url: baseUrl,
                changelog_url: `${baseUrl}/changelog`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── tools_info ───────────────────────────────────────────────────────
  mcp.registerTool(
    "tools_info",
    {
      title: "Get Tools Information with TypeScript Interface",
      description:
        "Get complete information about specified tools, including TypeScript interface definitions.",
      inputSchema: {
        tool_names: z
          .array(z.string())
          .describe(
            "Names of the tools to get complete information for."
          ),
      },
    },
    async (input: { tool_names: string[] }) => {
      const client = await getUtcpClient();
      try {
        const tsInterfaces: string[] = [];
        const infos: string[] = [];

        for (const name of input.tool_names) {
          const found = await findToolByName(client, name);
          if (found) {
            tsInterfaces.push(
              client.toolToTypeScriptInterface(
                found.tool as Parameters<typeof client.toolToTypeScriptInterface>[0]
              )
            );
          } else {
            infos.push(`// Tool '${name}' not found`);
          }
        }

        if (tsInterfaces.length === 0 && infos.length > 0) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: infos.join("\n\n") }],
          };
        }

        let fullContent = tsInterfaces.join("\n\n");
        if (infos.length > 0) fullContent += "\n\n" + infos.join("\n");

        return {
          content: [{ type: "text" as const, text: fullContent }],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: "text" as const, text: msg }],
        };
      }
    }
  );

  // ── get_all_tool_interfaces ─────────────────────────────────────────
  mcp.registerTool(
    "get_all_tool_interfaces",
    {
      title: "Get All Tool TypeScript Interfaces",
      description:
        "Returns TypeScript interface definitions for all registered tools across Hookmark CLI subcommands. Useful for understanding the full API surface at once.",
      inputSchema: {},
    },
    async () => {
      const client = await getUtcpClient();
      try {
        const interfaces = await client.getAllToolsTypeScriptInterfaces();
        return {
          content: [{ type: "text" as const, text: interfaces }],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: "text" as const, text: msg }],
        };
      }
    }
  );

  // ── get_required_keys_for_tool ───────────────────────────────────────
  mcp.registerTool(
    "get_required_keys_for_tool",
    {
      title: "Get Required Variables for Tool",
      description: "Get required environment variables for a registered tool.",
      inputSchema: {
        tool_name: z
          .string()
          .describe("Name of the tool to get required variables for."),
      },
    },
    async (input: { tool_name: string }) => {
      const client = await getUtcpClient();
      try {
        const found = await findToolByName(client, input.tool_name);
        if (!found) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Tool '${input.tool_name}' not found`,
              },
            ],
          };
        }
        const variables =
          await client.getRequiredVariablesForRegisteredTool(found.utcpName);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                tool_name: input.tool_name,
                required_variables: variables,
              }),
            },
          ],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                tool_name: input.tool_name,
                error: msg,
              }),
            },
          ],
        };
      }
    }
  );

  // ── call_tool_chain (the core code-mode tool) ────────────────────────
  mcp.registerTool(
    "call_tool_chain",
    {
      title: "Execute TypeScript Code with Hookmark Tool Access",
      description:
        "Execute TypeScript code with direct access to all registered Hookmark tools as hierarchical functions (e.g., hook.clip({ body: { item } }), hook.link({ body: { item_a, item_b } })).",
      inputSchema: {
        code: z
          .string()
          .describe(
            "TypeScript code to execute with access to all registered Hookmark tools."
          ),
        timeout: z
          .number()
          .optional()
          .default(30000)
          .describe("Optional timeout in milliseconds (default: 30000)."),
        memory_limit: z
          .number()
          .optional()
          .default(128)
          .describe(
            "Optional memory limit in MB for the isolated-vm sandbox (default: 128)."
          ),
        max_output_size: z
          .number()
          .optional()
          .default(200000)
          .describe(
            "Optional maximum output size in characters (default: 200000)."
          ),
      },
    },
    async (input: {
      code: string;
      timeout?: number;
      memory_limit?: number;
      max_output_size?: number;
    }) => {
      const client = await getUtcpClient();
      const maxOutput = input.max_output_size ?? 200000;

      try {
        const { result, logs } = await client.callToolChain(
          input.code,
          input.timeout ?? 30000,
          input.memory_limit ?? 128
        );

        function truncateText(text: string): string {
          if (text.length <= maxOutput) return text;
          return (
            text.slice(0, maxOutput) + "...\nmax_output_size exceeded"
          );
        }

        const content: ContentBlock[] = [];
        const processedResult: unknown[] = [];

        if (Array.isArray(result)) {
          for (const item of result) {
            if (ContentBlockSchema.safeParse(item).success) {
              content.push(item as ContentBlock);
            } else {
              processedResult.push(item);
            }
          }
        } else if (ContentBlockSchema.safeParse(result).success) {
          content.push(result as ContentBlock);
        } else {
          processedResult.push(result);
        }

        const plainContent =
          processedResult.length > 1
            ? processedResult
            : processedResult[0];
        const jsonContent = JSON.stringify({
          success: true,
          nonMcpContentResults: plainContent,
          logs,
        });
        content.push({
          type: "text" as const,
          text: truncateText(jsonContent),
        });

        return { content };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: "text" as const, text: msg }],
        };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Entry point (guarded so test imports do not start the server)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  setupMcpTools();
  await bootBridgeAndClient();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.log("[hook] MCP server running on stdio");
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch((err) => {
    console.error("[hook] Fatal error:", err);
    process.exit(1);
  });
}
