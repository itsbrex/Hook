// tests/manualBuilder.test.ts
import { describe, expect, it } from "vitest";
import { generateOpenApiSpec } from "../src/manualBuilder";
import type { HookCliSpec } from "../src/specTypes";

const SPEC: HookCliSpec = {
  generatedAt: "2026-04-20T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    {
      name: "clip",
      usage: "hook clip ITEM",
      description: "Generate a hook:// URL for ITEM.",
      options: [{ short: "-m", long: "--markdown", description: "Markdown link" }],
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
});
