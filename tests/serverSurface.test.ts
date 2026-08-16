import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_TOOL_NAMES,
  EXTENSION_TOOL_NAMES,
  SERVER_VERSION,
  TOOL_NAMES,
  buildUsageGuide,
  createMcpServer,
} from "../src/index";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: false,
  idempotentHint: true,
};

const openConnections: Array<{
  client: Client;
  server: ReturnType<typeof createMcpServer>;
}> = [];

async function connectServer(runtime: Parameters<typeof createMcpServer>[0] = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(runtime);
  const client = new Client({ name: "hook-surface-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  openConnections.push({ client, server });
  return client;
}

afterEach(async () => {
  await Promise.all(
    openConnections.splice(0).map(async ({ client, server }) => {
      await client.close();
      await server.close();
    })
  );
});

describe("server surface", () => {
  it("exposes exact canonical seven separately from Hook extensions", async () => {
    const client = await connectServer();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(CANONICAL_TOOL_NAMES).toEqual([
      "register_manual",
      "deregister_manual",
      "search_tools",
      "list_tools",
      "get_required_keys_for_tool",
      "tools_info",
      "call_tool_chain",
    ]);
    expect(EXTENSION_TOOL_NAMES).toEqual([
      "changelog",
      "hook_get_all_tool_interfaces",
      "get_all_tool_interfaces",
    ]);
    expect(TOOL_NAMES).toEqual([
      ...CANONICAL_TOOL_NAMES,
      ...EXTENSION_TOOL_NAMES,
    ]);
    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());

    const expectedWire = [
      ["register_manual", ["manual_call_template"], undefined],
      ["deregister_manual", ["manual_name"], undefined],
      ["search_tools", ["task_description", "limit"], READ_ONLY_ANNOTATIONS],
      ["list_tools", [], READ_ONLY_ANNOTATIONS],
      ["get_required_keys_for_tool", ["tool_name"], READ_ONLY_ANNOTATIONS],
      ["tools_info", ["tool_names"], READ_ONLY_ANNOTATIONS],
      ["call_tool_chain", ["code", "timeout", "max_output_size"], undefined],
    ] as const;

    expect(
      expectedWire.map(([name]) => {
        const tool = byName.get(name);
        return [
          name,
          Object.keys(tool?.inputSchema.properties ?? {}),
          tool?.annotations,
        ];
      })
    ).toEqual(expectedWire);
    expect(byName.get("get_all_tool_interfaces")?.description).toMatch(
      /Deprecated.*hook_get_all_tool_interfaces/i
    );
  });

  it("derives server version from package metadata", () => {
    const packageVersion = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ).version;
    expect(SERVER_VERSION).toBe(packageVersion);
  });

  it("preserves Hook extension outputs and legacy compatibility", async () => {
    const opened: Array<{ url: string; autoOpen: boolean }> = [];
    const runtimeClient = {
      async getTools() {
        return [
          {
            name: "hook.clip",
            utcp_name: "hook.clip-raw",
            description: "Clip current item",
          },
        ];
      },
      async getAllToolsTypeScriptInterfaces() {
        return "declare namespace hook { function clip(): unknown; }";
      },
    };
    const client = await connectServer({
      getClient: async () => runtimeClient as never,
      getBridgePort: () => 43123,
      changelogAutoOpen: true,
      openChangelog: async (url, options) => {
        opened.push({ url, autoOpen: options.autoOpen });
      },
    });

    const changelog = await client.callTool({
      name: "changelog",
      arguments: {},
    });
    expect(JSON.parse((changelog.content[0] as { text: string }).text)).toEqual({
      success: true,
      bridge_url: "http://127.0.0.1:43123",
      changelog_url: "http://127.0.0.1:43123/changelog",
    });
    expect(opened).toEqual([
      {
        url: "http://127.0.0.1:43123/changelog",
        autoOpen: true,
      },
    ]);

    const interfaces = await client.callTool({
      name: "hook_get_all_tool_interfaces",
      arguments: {},
    });
    expect(JSON.parse((interfaces.content[0] as { text: string }).text)).toEqual({
      tools: [
        { utcp_name: "hook.clip-raw", access_name: "hook.clip" },
      ],
      typescript_interfaces:
        "declare namespace hook { function clip(): unknown; }",
    });

    const legacy = await client.callTool({
      name: "get_all_tool_interfaces",
      arguments: {},
    });
    expect(legacy.content).toEqual([
      {
        type: "text",
        text: "declare namespace hook { function clip(): unknown; }",
      },
    ]);
  });

  it("preserves MCP content blocks and canonical result envelope", async () => {
    const calls: unknown[][] = [];
    const runtimeClient = {
      async callToolChain(...args: unknown[]) {
        calls.push(args);
        return {
          result: [
            { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
            { ok: true },
          ],
          logs: ["done"],
        };
      },
    };
    const client = await connectServer({
      getClient: async () => runtimeClient as never,
    });

    const response = await client.callTool({
      name: "call_tool_chain",
      arguments: { code: "return 1", timeout: 50, max_output_size: 2_000 },
    });

    expect(calls).toEqual([["return 1", 50]]);
    expect(response.isError).not.toBe(true);
    expect(response.content[0]).toMatchObject({ type: "image", data: "aGVsbG8=" });
    expect(JSON.parse((response.content[1] as { text: string }).text)).toEqual({
      success: true,
      nonMcpContentResults: { ok: true },
      logs: ["done"],
    });
  });

  it("marks execution errors and caps oversized output", async () => {
    let fail = false;
    const runtimeClient = {
      async callToolChain() {
        if (fail) throw new Error("boom");
        return { result: "x".repeat(100), logs: [] };
      },
    };
    const client = await connectServer({
      getClient: async () => runtimeClient as never,
    });

    const capped = await client.callTool({
      name: "call_tool_chain",
      arguments: { code: "return 1", max_output_size: 20 },
    });
    expect((capped.content[0] as { text: string }).text).toContain(
      "max_output_size exceeded"
    );

    fail = true;
    const failed = await client.callTool({
      name: "call_tool_chain",
      arguments: { code: "throw new Error()" },
    });
    expect(failed.isError).toBe(true);
    expect(failed.content).toEqual([{ type: "text", text: "boom" }]);
  });

  it("teaches hook.<subcommand>() usage", () => {
    const guide = buildUsageGuide();
    expect(guide).toContain("hook.clip");
    expect(guide).toContain("hook.link");
    expect(guide).toContain("call_tool_chain");
    expect(guide).toContain("body:");
    expect(guide).not.toContain("return await hook.clip({ item:");
  });
});
