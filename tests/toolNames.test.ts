import { describe, expect, it } from "vitest";
import {
  createCollisionSafeToolClient,
  serializeToolIdentity,
} from "../src/toolNames";

function createClient(toolNames: string[]) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const tools = toolNames.map((name) => ({
    name,
    description: name,
    inputs: { type: "object", properties: {} },
    outputs: { type: "object" },
  }));
  const client = {
    async getTools() {
      return tools;
    },
    async searchTools() {
      return tools;
    },
    async callTool(name: string, args: unknown) {
      calls.push({ name, args });
      return { name };
    },
    async getRequiredVariablesForRegisteredTool(name: string) {
      return [`${name}_KEY`];
    },
  };
  return { client, calls };
}

describe("collision-safe tool names", () => {
  it("keeps raw identity, emits stable access names, and routes to raw names", async () => {
    const rawNames = ["hook.server-a", "hook.server_a"];
    const forward = createClient(rawNames);
    const reverse = createClient([...rawNames].reverse());
    const client = createCollisionSafeToolClient(forward.client as never);
    const reverseClient = createCollisionSafeToolClient(reverse.client as never);

    const identities = (await client.getTools()).map(serializeToolIdentity);
    const reverseIdentities = (await reverseClient.getTools()).map(
      serializeToolIdentity
    );

    expect(new Set(identities.map((tool) => tool.access_name)).size).toBe(2);
    expect(identities.every((tool) => tool.access_name.includes("__raw_"))).toBe(
      true
    );
    expect(
      Object.fromEntries(identities.map((tool) => [tool.utcp_name, tool.access_name]))
    ).toEqual(
      Object.fromEntries(
        reverseIdentities.map((tool) => [tool.utcp_name, tool.access_name])
      )
    );

    await client.callTool(identities[0]!.access_name, { routed: true });
    expect(forward.calls).toEqual([
      { name: identities[0]!.utcp_name, args: { routed: true } },
    ]);
  });
});
