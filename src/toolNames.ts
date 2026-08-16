import type { CodeModeUtcpClient } from "@utcp/code-mode";
import type { Tool } from "@utcp/sdk";

export interface ToolIdentity {
  utcp_name: string;
  access_name: string;
}

interface ToolNameResolution {
  rawName: string;
  legacyAccessName: string;
  exposedAccessName: string;
}

interface ToolAliasIndex {
  aliasToCanonical: Map<string, string>;
  canonicalNames: Set<string>;
  canonicalToAlias: Map<string, string>;
}

type AliasAwareClient = CodeModeUtcpClient & {
  callTool(toolName: string, toolArgs: unknown): Promise<unknown>;
  __findToolByName?: (
    name: string
  ) => Promise<{ tool: Tool; utcpName: string } | null>;
};

export function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

export function utcpNameToTsInterfaceName(utcpName: string): string {
  if (!utcpName.includes(".")) return sanitizeIdentifier(utcpName);
  const [manualName, ...toolParts] = utcpName.split(".");
  return `${sanitizeIdentifier(manualName!)}.${toolParts
    .map((part) => sanitizeIdentifier(part))
    .join("_")}`;
}

function disambiguateAccessName(accessName: string, rawName: string): string {
  return `${accessName}__raw_${Buffer.from(rawName, "utf8").toString("hex")}`;
}

function buildToolAliasIndex(tools: Tool[]): ToolAliasIndex {
  const canonicalNames = new Set(tools.map((tool) => tool.name));
  const resolutions: ToolNameResolution[] = tools.map((tool) => ({
    rawName: tool.name,
    legacyAccessName: utcpNameToTsInterfaceName(tool.name),
    exposedAccessName: utcpNameToTsInterfaceName(tool.name),
  }));
  const accessCounts = new Map<string, number>();
  for (const resolution of resolutions) {
    accessCounts.set(
      resolution.legacyAccessName,
      (accessCounts.get(resolution.legacyAccessName) ?? 0) + 1
    );
  }

  const usedAccessNames = new Set(canonicalNames);
  for (const resolution of resolutions) {
    const shadowsCanonical =
      canonicalNames.has(resolution.legacyAccessName) &&
      resolution.legacyAccessName !== resolution.rawName;
    if (
      accessCounts.get(resolution.legacyAccessName) === 1 &&
      !shadowsCanonical
    ) {
      usedAccessNames.add(resolution.legacyAccessName);
    }
  }

  for (const resolution of resolutions) {
    const shadowsCanonical =
      canonicalNames.has(resolution.legacyAccessName) &&
      resolution.legacyAccessName !== resolution.rawName;
    if (
      (accessCounts.get(resolution.legacyAccessName) ?? 0) > 1 ||
      shadowsCanonical
    ) {
      resolution.exposedAccessName = disambiguateAccessName(
        resolution.legacyAccessName,
        resolution.rawName
      );
      while (usedAccessNames.has(resolution.exposedAccessName)) {
        resolution.exposedAccessName = disambiguateAccessName(
          resolution.exposedAccessName,
          resolution.rawName
        );
      }
    }
    usedAccessNames.add(resolution.exposedAccessName);
  }

  const canonicalToAlias = new Map(
    resolutions.map((resolution) => [
      resolution.rawName,
      resolution.exposedAccessName,
    ])
  );
  const aliasToCanonical = new Map<string, string>();
  for (const resolution of resolutions) {
    if (
      resolution.exposedAccessName !== resolution.rawName &&
      !canonicalNames.has(resolution.exposedAccessName)
    ) {
      aliasToCanonical.set(
        resolution.exposedAccessName,
        resolution.rawName
      );
    }
    if (
      accessCounts.get(resolution.legacyAccessName) === 1 &&
      resolution.legacyAccessName !== resolution.rawName &&
      !canonicalNames.has(resolution.legacyAccessName) &&
      !aliasToCanonical.has(resolution.legacyAccessName)
    ) {
      aliasToCanonical.set(resolution.legacyAccessName, resolution.rawName);
    }
  }

  return { aliasToCanonical, canonicalNames, canonicalToAlias };
}

function exposeToolAlias(tool: Tool, index: ToolAliasIndex): Tool {
  const accessName = index.canonicalToAlias.get(tool.name) ?? tool.name;
  if (accessName === tool.name) return tool;
  return { ...tool, name: accessName, utcp_name: tool.name } as Tool;
}

export function serializeToolIdentity(tool: Tool): ToolIdentity {
  return {
    utcp_name:
      (tool as Tool & { utcp_name?: string }).utcp_name ?? tool.name,
    access_name: tool.name,
  };
}

export function createCollisionSafeToolClient(
  baseClient: CodeModeUtcpClient
): AliasAwareClient {
  const client = baseClient as AliasAwareClient;
  const getCanonicalTools = client.getTools.bind(client);
  const searchCanonicalTools = client.searchTools.bind(client);
  const callCanonicalTool = client.callTool.bind(client);
  const getCanonicalRequiredVariables =
    client.getRequiredVariablesForRegisteredTool.bind(client);

  const getTools = async (): Promise<Tool[]> => {
    const tools = await getCanonicalTools();
    const index = buildToolAliasIndex(tools);
    return tools.map((tool) => exposeToolAlias(tool, index));
  };
  const searchTools = async (
    taskDescription: string,
    limit?: number
  ): Promise<Tool[]> => {
    const [matchedTools, allTools] = await Promise.all([
      searchCanonicalTools(taskDescription, limit),
      getCanonicalTools(),
    ]);
    const index = buildToolAliasIndex(allTools);
    return matchedTools.map((tool) => exposeToolAlias(tool, index));
  };
  const resolveToolName = async (name: string): Promise<string> => {
    const index = buildToolAliasIndex(await getCanonicalTools());
    if (index.canonicalNames.has(name)) return name;
    return index.aliasToCanonical.get(name) ?? name;
  };
  const callTool = async (name: string, args: unknown) =>
    callCanonicalTool(await resolveToolName(name), args);
  const getRequiredVariablesForRegisteredTool = async (name: string) =>
    getCanonicalRequiredVariables(await resolveToolName(name));
  const findToolByAlias = async (
    name: string
  ): Promise<{ tool: Tool; utcpName: string } | null> => {
    const tools = await getCanonicalTools();
    const index = buildToolAliasIndex(tools);
    const rawName = index.canonicalNames.has(name)
      ? name
      : index.aliasToCanonical.get(name);
    if (!rawName) return null;
    const tool = tools.find((candidate) => candidate.name === rawName);
    return tool
      ? { tool: exposeToolAlias(tool, index), utcpName: rawName }
      : null;
  };

  const overrides: Record<PropertyKey, unknown> = {
    getTools,
    searchTools,
    callTool,
    getRequiredVariablesForRegisteredTool,
    __findToolByName: findToolByAlias,
  };
  return new Proxy(client, {
    get(target, property, receiver) {
      if (Object.prototype.hasOwnProperty.call(overrides, property)) {
        return overrides[property];
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(receiver) : value;
    },
  });
}

export async function findToolByName(
  client: Pick<AliasAwareClient, "getTools">,
  name: string
): Promise<{ tool: Tool; utcpName: string } | null> {
  const aliasAwareClient = client as Pick<AliasAwareClient, "getTools"> & {
    __findToolByName?: AliasAwareClient["__findToolByName"];
  };
  const found = await aliasAwareClient.__findToolByName?.(name);
  if (found) return found;

  for (const tool of await client.getTools()) {
    const identity = serializeToolIdentity(tool);
    if (name === identity.utcp_name || name === identity.access_name) {
      return { tool, utcpName: identity.utcp_name };
    }
  }
  return null;
}
