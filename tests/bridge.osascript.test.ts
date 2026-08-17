import { describe, it, expect, vi } from "vitest";
import { createBridgeServer } from "../src/bridge";
import type { HookCliSpec } from "../src/specTypes";

const SPEC: HookCliSpec = {
  generatedAt: "2026-04-22T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    {
      name: "all_bookmarks",
      usage: "all_bookmarks",
      description: "Return all bookmarks from Hookmark.",
      options: [],
      source: "osascript",
      appleScriptSource: 'tell application "Hookmark" to return ""',
      appleScriptParser: "raw",
    },
  ],
};

describe("bridge (osascript source)", () => {
  it("routes osascript subcommands through the osascript executor, not runHook", async () => {
    const runHook = vi.fn(() => "SHOULD NOT BE CALLED");
    const runOsascript = vi.fn(() => '"ok"');
    const { listen, close } = createBridgeServer({
      spec: SPEC,
      hookCli: "/opt/bin/hook",
      runHook,
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/all_bookmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      expect(runHook).not.toHaveBeenCalled();
      expect(runOsascript).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("surfaces osascript errors with -1743 Automation hint", async () => {
    const runOsascript = vi.fn(() => {
      throw Object.assign(
        new Error(
          "execution error: Not authorized to send Apple events (-1743)"
        ),
        { name: "OsascriptError" }
      );
    });
    const { listen, close } = createBridgeServer({
      spec: SPEC,
      hookCli: "/opt/bin/hook",
      runHook: vi.fn(),
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/all_bookmarks`, {
        method: "POST",
        body: "{}",
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; hint?: string };
      expect(body.hint).toContain("Automation");
    } finally {
      await close();
    }
  });

  it("POST /all_bookmarks with timeoutMs passes override to runOsascript", async () => {
    const runOsascript = vi.fn(
      (_script: string, _args: string[], opts?: { timeoutMs?: number }) => {
        expect(opts?.timeoutMs).toBe(90_000);
        return '"ok"';
      }
    );
    const { listen, close } = createBridgeServer({
      spec: SPEC,
      hookCli: "/opt/bin/hook",
      runHook: vi.fn(),
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/all_bookmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeoutMs: 90_000 }),
      });
      expect(res.status).toBe(200);
      expect(runOsascript).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("POST /all_bookmarks without timeoutMs leaves executor default", async () => {
    const runOsascript = vi.fn(
      (_script: string, _args: string[], opts?: { timeoutMs?: number }) => {
        expect(opts?.timeoutMs).toBeUndefined();
        return '"ok"';
      }
    );
    const { listen, close } = createBridgeServer({
      spec: SPEC,
      hookCli: "/opt/bin/hook",
      runHook: vi.fn(),
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/all_bookmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      expect(runOsascript).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("POST /all_bookmarks without timeoutMs uses configured server default", async () => {
    const runOsascript = vi.fn(
      (_script: string, _args: string[], opts?: { timeoutMs?: number }) => {
        expect(opts?.timeoutMs).toBe(90_000);
        return '"ok"';
      }
    );
    const { listen, close } = createBridgeServer({
      spec: SPEC,
      hookCli: "/opt/bin/hook",
      defaultTimeoutMs: 90_000,
      runHook: vi.fn(),
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/all_bookmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      expect(runOsascript).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("returns 500 when osascript executor isn't wired", async () => {
    const { listen, close } = createBridgeServer({
      spec: SPEC,
      hookCli: "/opt/bin/hook",
      runHook: vi.fn(),
      // runOsascript intentionally omitted
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/all_bookmarks`, {
        method: "POST",
        body: "{}",
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("osascript executor not wired");
    } finally {
      await close();
    }
  });
});
