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
        { name: "find", usage: "hook find [SEARCH_STRING]", description: "", options: [] },
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
      const res = await fetch(`http://127.0.0.1:${port}/find?search_string=attio`, {
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

  it("POST /percent_encode routes via stdin with `-` arg", async () => {
    const runHook = vi.fn(
      (
        _hookCli: string,
        args: string[],
        _opts?: { stdin?: string; timeoutMs?: number }
      ) => {
        expect(args).toEqual(["percent", "encode", "-"]);
        expect(_opts?.stdin).toBe("hello world");
        return "hello%20world";
      }
    );
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
      const body = (await res.json()) as { output: string };
      expect(body.output).toBe("hello%20world");
      expect(runHook).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("POST /percent_decode routes via stdin with `-` arg", async () => {
    const runHook = vi.fn(
      (
        _hookCli: string,
        args: string[],
        _opts?: { stdin?: string; timeoutMs?: number }
      ) => {
        expect(args).toEqual(["percent", "decode", "-"]);
        expect(_opts?.stdin).toBe("hello%20world");
        return "hello world";
      }
    );
    const spec: HookCliSpec = {
      generatedAt: "2026-04-20T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        {
          name: "percent_decode",
          cliArgs: ["percent", "decode"],
          usage: "hook percent decode STRING",
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
      const res = await fetch(`http://127.0.0.1:${port}/percent_decode`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ string: "hello%20world" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: string };
      expect(body.output).toBe("hello world");
      expect(runHook).toHaveBeenCalledOnce();
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
        "Search results for: attio",
        "---------",
        "Title: Found",
        "Path: /f",
        "Address: hook://file/F",
        "---------------------",
      ].join("\n"),
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        {
          name: "find",
          usage: "hook find [SEARCH_STRING]",
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
        body: JSON.stringify({ search_string: "attio", json: true }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: unknown };
      expect(Array.isArray(body.output)).toBe(true);
      expect((body.output as VerboseBookmark[])[0]).toEqual({
        name: "Found",
        address: "hook://file/F",
        path: "/f",
        hooked: [],
      });
      expect(runHook).toHaveBeenCalledWith(
        "/opt/bin/hook",
        expect.arrayContaining(["find", "attio", "--output_format=verbose"]),
      );
    } finally {
      await close();
    }
  });

  it("POST /list with timeoutMs passes override to runHook", async () => {
    const runHook = vi.fn(
      (
        _hookCli: string,
        args: string[],
        opts?: { stdin?: string; timeoutMs?: number }
      ) => {
        expect(opts?.timeoutMs).toBe(90_000);
        expect(args).not.toContain("timeoutMs");
        expect(args.some((a) => a.includes("timeoutMs"))).toBe(false);
        return "ok";
      }
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        { name: "list", usage: "hook list [FILE_OR_URL]", description: "", options: [] },
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
        body: JSON.stringify({ timeoutMs: 90_000 }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: unknown };
      expect(body.output).toBe("ok");
      expect(runHook).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("POST /list without timeoutMs leaves the executor default in place", async () => {
    const runHook = vi.fn(
      (
        _hookCli: string,
        _args: string[],
        opts?: { stdin?: string; timeoutMs?: number }
      ) => {
        expect(opts?.timeoutMs).toBeUndefined();
        return "ok";
      }
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        { name: "list", usage: "hook list [FILE_OR_URL]", description: "", options: [] },
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
      expect(runHook).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("POST /list without timeoutMs uses the configured server default", async () => {
    const runHook = vi.fn(
      (
        _hookCli: string,
        _args: string[],
        opts?: { stdin?: string; timeoutMs?: number }
      ) => {
        expect(opts?.timeoutMs).toBe(90_000);
        return "ok";
      }
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        { name: "list", usage: "hook list [FILE_OR_URL]", description: "", options: [] },
      ],
    };
    const { listen, close } = createBridgeServer({
      spec,
      hookCli: "/opt/bin/hook",
      defaultTimeoutMs: 90_000,
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
      expect(runHook).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("POST /list with non-numeric timeoutMs ignores the override", async () => {
    const runHook = vi.fn(
      (
        _hookCli: string,
        _args: string[],
        opts?: { stdin?: string; timeoutMs?: number }
      ) => {
        expect(opts?.timeoutMs).toBeUndefined();
        return "ok";
      }
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        { name: "list", usage: "hook list [FILE_OR_URL]", description: "", options: [] },
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
        body: JSON.stringify({ timeoutMs: "not-a-number" }),
      });
      expect(res.status).toBe(200);
      expect(runHook).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("POST /list with timeoutMs <= 0 ignores the override", async () => {
    const runHook = vi.fn(
      (
        _hookCli: string,
        _args: string[],
        opts?: { stdin?: string; timeoutMs?: number }
      ) => {
        expect(opts?.timeoutMs).toBeUndefined();
        return "ok";
      }
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [
        { name: "list", usage: "hook list [FILE_OR_URL]", description: "", options: [] },
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
      for (const bad of [-1, 0]) {
        const res = await fetch(`http://127.0.0.1:${port}/list`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ timeoutMs: bad }),
        });
        expect(res.status).toBe(200);
      }
      expect(runHook).toHaveBeenCalledTimes(2);
    } finally {
      await close();
    }
  });

  it("POST /percent_encode honors body timeoutMs via stdin branch", async () => {
    const runHook = vi.fn(
      (
        _hookCli: string,
        args: string[],
        opts?: { stdin?: string; timeoutMs?: number }
      ) => {
        expect(args).toEqual(["percent", "encode", "-"]);
        expect(opts?.stdin).toBe("x");
        expect(opts?.timeoutMs).toBe(45_000);
        return "x";
      }
    );
    const spec: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
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
        body: JSON.stringify({ string: "x", timeoutMs: 45_000 }),
      });
      expect(res.status).toBe(200);
      expect(runHook).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("POST /find with json=true uses the find-specific parser", async () => {
    const runHook = vi.fn(() =>
      [
        "Search results for: linkedin",
        "---------",
        "Title: attio-linkedin-userscript",
        "Path: /Users/hack/github/attio-linkedin-userscript",
        "Address: hook://file/7lkIC2naF",
        "---------------------",
      ].join("\n")
    );
    const spec: HookCliSpec = {
      generatedAt: "t",
      hookVersion: "1",
      subcommands: [
        {
          name: "find",
          usage: "hook find [SEARCH_STRING]",
          description: "",
          options: [
            { short: "-o", long: "--output_format", description: "", valueArg: "FORMAT" },
          ],
        },
      ],
    };
    const { listen, close } = createBridgeServer({ spec, hookCli: "/opt/bin/hook", runHook, getChangelogHtml: () => "" });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/find`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ search_string: "linkedin", json: true }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: VerboseBookmark[] };
      expect(body.output[0]).toEqual({
        name: "attio-linkedin-userscript",
        address: "hook://file/7lkIC2naF",
        path: "/Users/hack/github/attio-linkedin-userscript",
        hooked: [],
      });
      expect(runHook).toHaveBeenCalledWith(
        "/opt/bin/hook",
        expect.arrayContaining(["find", "--output_format=verbose", "linkedin"]),
      );
    } finally {
      await close();
    }
  });

  it("POST /find with empty body returns 400 (would hang on stdin)", async () => {
    const runHook = vi.fn(() => "SHOULD NOT BE CALLED");
    const spec: HookCliSpec = { generatedAt: "t", hookVersion: "1", subcommands: [
      { name: "find", usage: "hook find [SEARCH_STRING]", description: "", options: [] },
    ]};
    const { listen, close } = createBridgeServer({ spec, hookCli: "/opt/bin/hook", runHook, getChangelogHtml: () => "" });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/find`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/non-empty search_string/);
      expect(runHook).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("POST /find with whitespace-only search_string returns 400", async () => {
    const runHook = vi.fn();
    const spec: HookCliSpec = { generatedAt: "t", hookVersion: "1", subcommands: [
      { name: "find", usage: "hook find [SEARCH_STRING]", description: "", options: [] },
    ]};
    const { listen, close } = createBridgeServer({ spec, hookCli: "/opt/bin/hook", runHook, getChangelogHtml: () => "" });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/find`, {
        method: "POST",
        body: JSON.stringify({ search_string: "   " }),
      });
      expect(res.status).toBe(400);
      expect(runHook).not.toHaveBeenCalled();
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
