// tests/lifecycle.test.ts
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installShutdownHooks } from "../src/lifecycle";

function makeDeps(overrides: Partial<Parameters<typeof installShutdownHooks>[0]> = {}) {
  const stdin = new EventEmitter();
  const signals = new EventEmitter();
  let ppid = 4242;
  const deps = {
    stdin,
    signals,
    getPpid: () => ppid,
    cleanup: vi.fn(async () => {}),
    exit: vi.fn(),
    log: vi.fn(),
    parentPollMs: 1000,
    cleanupTimeoutMs: 500,
    ...overrides,
  };
  return { deps, stdin, signals, setPpid: (p: number) => (ppid = p) };
}

describe("installShutdownHooks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["end", "close"])("cleans up and exits 0 when stdin emits %s", async (event) => {
    const { deps, stdin } = makeDeps();
    installShutdownHooks(deps);
    stdin.emit(event);
    await vi.waitFor(() => expect(deps.exit).toHaveBeenCalledWith(0));
    expect(deps.cleanup).toHaveBeenCalledTimes(1);
  });

  it.each(["SIGTERM", "SIGINT", "SIGHUP"])("cleans up and exits 0 on %s", async (signal) => {
    const { deps, signals } = makeDeps();
    installShutdownHooks(deps);
    signals.emit(signal);
    await vi.waitFor(() => expect(deps.exit).toHaveBeenCalledWith(0));
    expect(deps.cleanup).toHaveBeenCalledTimes(1);
  });

  it("runs cleanup once when several triggers fire", async () => {
    const { deps, stdin, signals } = makeDeps();
    const { shutdown } = installShutdownHooks(deps);
    stdin.emit("end");
    stdin.emit("close");
    signals.emit("SIGTERM");
    await shutdown("SIGINT");
    expect(deps.cleanup).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it("exits when the parent process changes (orphaned)", async () => {
    vi.useFakeTimers();
    const { deps, setPpid } = makeDeps();
    installShutdownHooks(deps);
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.exit).not.toHaveBeenCalled();
    setPpid(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it("still exits when cleanup hangs past the timeout", async () => {
    vi.useFakeTimers();
    const { deps, stdin } = makeDeps({ cleanup: vi.fn(() => new Promise<void>(() => {})) });
    installShutdownHooks(deps);
    stdin.emit("end");
    await vi.advanceTimersByTimeAsync(499);
    expect(deps.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it("still exits when cleanup rejects", async () => {
    const { deps, stdin } = makeDeps({ cleanup: vi.fn(async () => { throw new Error("boom"); }) });
    installShutdownHooks(deps);
    stdin.emit("end");
    await vi.waitFor(() => expect(deps.exit).toHaveBeenCalledWith(0));
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});

describe("server process", () => {
  it("exits after the client closes stdin", async () => {
    const entry = path.resolve(__dirname, "..", "src", "index.ts");
    const child = spawn(process.execPath, ["--import", "tsx", entry], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        HOOK_BRIDGE_PORT: "0",
        HOOK_SKIP_REGEN: "1",
        HOOK_SKIP_APPLESCRIPT: "1",
        HOOK_CHANGELOG_AUTO_OPEN: "0",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    try {
      await vi.waitFor(() => expect(stderr).toContain("MCP server running on stdio"), {
        timeout: 15000,
        interval: 100,
      });
      const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
      child.stdin.end();
      const code = await Promise.race([
        exited,
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 5000)),
      ]);
      expect(code).toBe(0);
    } finally {
      child.kill("SIGKILL");
    }
  }, 30000);
});
