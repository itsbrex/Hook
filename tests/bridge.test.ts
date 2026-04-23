// tests/bridge.test.ts
import { describe, expect, it, vi } from "vitest";
import { createBridgeServer } from "../src/bridge";
import type { HookCliSpec } from "../src/specTypes";
import type { VerboseBookmark } from "../src/verboseParser";

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

  it("spreads array body values across variadic positionals", async () => {
    const runHook = vi.fn(() => "ok");
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        { name: "remove", usage: "hook remove FILE_OR_URL...", description: "", options: [] },
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
      const res = await fetch(`http://127.0.0.1:${port}/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_or_url: ["/a.md", "/b.md"] }),
      });
      expect(res.status).toBe(200);
      expect(runHook).toHaveBeenCalledWith("/opt/bin/hook", ["remove", "/a.md", "/b.md"]);
    } finally {
      await close();
    }
  });

  it("uses sub.cliArgs as invocation prefix when provided", async () => {
    const runHook = vi.fn(() => "hello%20world");
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        {
          name: "percent_encode",
          cliArgs: ["percent", "encode"],
          usage: "hook percent encode STRING",
          description: "",
          options: [],
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
      const res = await fetch(`http://127.0.0.1:${port}/percent_encode`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ string: "hello world" }),
      });
      expect(res.status).toBe(200);
      expect(runHook).toHaveBeenCalledWith("/opt/bin/hook", ["percent", "encode", "hello world"]);
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

  it("annotates -1743 AppleEvents errors with an automation-permission hint", async () => {
    const runHook = vi.fn(() => {
      throw new Error(`Command failed: hook clip /a.md\n89:136: execution error: Not authorized to send Apple events to Hookmark. (-1743)`);
    });
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        { name: "clip", usage: "hook clip FILE_OR_URL", description: "", options: [] },
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
      const res = await fetch(`http://127.0.0.1:${port}/clip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_or_url: "/a.md" }),
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; hint?: string };
      expect(body.error).toContain("-1743");
      expect(body.hint).toContain("Automation");
      expect(body.hint).toContain("Hookmark");
    } finally {
      await close();
    }
  });

  it("POST /list with json=true returns structured records", async () => {
    const runHook = vi.fn(() =>
      [
        "Name: N",
        "Address: hook://file/A",
        "Path: /a",
        "Hooked:",
        "  - hook://file/B",
        "",
      ].join("\n"),
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        {
          name: "list",
          usage: "hook list [FILE_OR_URL]",
          description: "",
          options: [
            {
              short: "-o",
              long: "--output_format",
              description: "",
              valueArg: "FORMAT",
            },
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
        body: JSON.stringify({ file_or_url: "/a", json: true }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: unknown };
      expect(Array.isArray(body.output)).toBe(true);
      expect((body.output as VerboseBookmark[])[0]).toEqual({
        name: "N",
        address: "hook://file/A",
        path: "/a",
        hooked: ["hook://file/B"],
      });
      expect(runHook).toHaveBeenCalledWith(
        "/opt/bin/hook",
        expect.arrayContaining(["list", "/a", "--output_format=verbose"]),
      );
    } finally {
      await close();
    }
  });

  it("POST /list without json=true returns raw CLI stdout", async () => {
    const runHook = vi.fn(() => "raw-output-text");
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        {
          name: "list",
          usage: "hook list [FILE_OR_URL]",
          description: "",
          options: [
            {
              short: "-o",
              long: "--output_format",
              description: "",
              valueArg: "FORMAT",
            },
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
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: unknown };
      expect(body.output).toBe("raw-output-text");
      const argv = runHook.mock.calls[0][1] as string[];
      expect(argv).not.toContain("--output_format=verbose");
    } finally {
      await close();
    }
  });

  it("POST /clip with json=true ignores the flag and returns raw output", async () => {
    const runHook = vi.fn(() => "hook://file/X");
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        { name: "clip", usage: "hook clip FILE", description: "", options: [] },
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
      const res = await fetch(`http://127.0.0.1:${port}/clip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: true, file: "/a" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: unknown };
      expect(body.output).toBe("hook://file/X");
      const argv = runHook.mock.calls[0][1] as string[];
      expect(argv).not.toContain("--output_format=verbose");
      expect(argv.some((a) => a.includes("json"))).toBe(false);
    } finally {
      await close();
    }
  });

  it("POST /find with json=true returns structured records", async () => {
    const runHook = vi.fn(() =>
      [
        "Name: Found",
        "Address: hook://file/F",
        "Path: /f",
        "Hooked:",
        "  - hook://file/G",
        "",
      ].join("\n"),
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        {
          name: "find",
          usage: "hook find QUERY",
          description: "",
          options: [
            {
              short: "-o",
              long: "--output_format",
              description: "",
              valueArg: "FORMAT",
            },
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
      const res = await fetch(`http://127.0.0.1:${port}/find`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "attio", json: true }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: unknown };
      expect(Array.isArray(body.output)).toBe(true);
      expect((body.output as VerboseBookmark[])[0]).toEqual({
        name: "Found",
        address: "hook://file/F",
        path: "/f",
        hooked: ["hook://file/G"],
      });
      expect(runHook).toHaveBeenCalledWith(
        "/opt/bin/hook",
        expect.arrayContaining(["find", "attio", "--output_format=verbose"]),
      );
    } finally {
      await close();
    }
  });

  it("routes POST /cp to the clip subcommand via alias", async () => {
    const runHook = vi.fn(() => "ok");
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        {
          name: "clip",
          aliases: ["cp"],
          usage: "hook clip FILE_OR_URL",
          description: "",
          options: [],
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
      const res = await fetch(`http://127.0.0.1:${port}/cp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_or_url: "/x.md" }),
      });
      expect(res.status).toBe(200);
      expect(runHook).toHaveBeenCalledWith("/opt/bin/hook", ["clip", "/x.md"]);
    } finally {
      await close();
    }
  });
});
