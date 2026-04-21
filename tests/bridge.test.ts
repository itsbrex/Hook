// tests/bridge.test.ts
import { describe, expect, it, vi } from "vitest";
import { createBridgeServer } from "../src/bridge";
import type { HookCliSpec } from "../src/specTypes";

const SPEC: HookCliSpec = {
  generatedAt: "2026-04-20T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    { name: "clip", usage: "hook clip ITEM", description: "Get URL", options: [] },
  ],
};

function makeServer(runHook = vi.fn(() => "hook://file/abc")) {
  return createBridgeServer({
    spec: SPEC,
    hookCli: "/opt/bin/hook",
    runHook,
    getChangelogHtml: () => "<html>changelog</html>",
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.text() };
}

describe("bridge server", () => {
  it("serves /openapi with the generated spec", async () => {
    const { listen, close } = makeServer();
    const port = await listen(0);
    try {
      const { status, body } = await fetchJson(`http://127.0.0.1:${port}/openapi`);
      expect(status).toBe(200);
      expect(JSON.parse(body).paths["/clip"]).toBeDefined();
    } finally {
      await close();
    }
  });

  it("POST /<subcommand> calls runHook and returns output", async () => {
    const runHook = vi.fn(() => "hook://file/abc");
    const { listen, close } = makeServer(runHook);
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/clip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item: "/Users/me/note.md" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.output).toBe("hook://file/abc");
      expect(runHook).toHaveBeenCalledWith("/opt/bin/hook", ["clip", "/Users/me/note.md"]);
    } finally {
      await close();
    }
  });

  it("accepts query-string params on POST requests", async () => {
    const runHook = vi.fn(() => "hook://file/abc");
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        { name: "find", usage: "hook find QUERY", description: "", options: [] },
      ],
    };
    const { listen, close } = createBridgeServer({
      spec,
      hookCli: "/opt/bin/hook",
      runHook,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/find?query=attio`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      expect(runHook).toHaveBeenCalledWith("/opt/bin/hook", ["find", "attio"]);
    } finally {
      await close();
    }
  });

  it("omits missing bracketed-optional positionals from CLI args", async () => {
    const runHook = vi.fn(() => "ok");
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        { name: "list", usage: "hook list [FILTER]", description: "", options: [] },
      ],
    };
    const { listen, close } = createBridgeServer({
      spec,
      hookCli: "/opt/bin/hook",
      runHook,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      expect(runHook).toHaveBeenCalledWith("/opt/bin/hook", ["list"]);
    } finally {
      await close();
    }
  });

  it("forwards value-taking flags as --long=value in argv", async () => {
    const runHook = vi.fn(() => "ok");
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        {
          name: "list",
          usage: "hook list [FILE_OR_URL]",
          description: "",
          options: [
            { short: "-o", long: "--output_format", description: "", valueArg: "FORMAT" },
          ],
        },
      ],
    };
    const { listen, close } = createBridgeServer({
      spec,
      hookCli: "/opt/bin/hook",
      runHook,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ output_format: "markdown" }),
      });
      expect(res.status).toBe(200);
      expect(runHook).toHaveBeenCalledWith("/opt/bin/hook", ["list", "--output_format=markdown"]);
    } finally {
      await close();
    }
  });

  it("returns 404 for unknown operations", async () => {
    const { listen, close } = makeServer();
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/bogus`, { method: "POST", body: "{}" });
      expect(res.status).toBe(404);
    } finally {
      await close();
    }
  });
});
