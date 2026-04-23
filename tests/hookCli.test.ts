import { describe, expect, it, vi, beforeEach } from "vitest";
import { shellEscape, extractHookUrl, buildHookCommand } from "../src/hookCli";

describe("hookCli helpers", () => {
  it("quotes empty strings and escapes single quotes", () => {
    expect(shellEscape("")).toBe("''");
    expect(shellEscape("it's fine")).toBe("'it'\\''s fine'");
    expect(shellEscape("/Users/x/file.md")).toBe("'/Users/x/file.md'");
  });

  it("extracts hook:// URLs from CLI output", () => {
    expect(extractHookUrl("Copied hook://file/abc123 to clipboard")).toBe("hook://file/abc123");
    expect(extractHookUrl("nothing here")).toBeNull();
  });

  it("builds a shell-escaped command line", () => {
    const cmd = buildHookCommand("/opt/bin/hook", ["list", "-o", "paths", "/a b.md"]);
    expect(cmd).toBe("'/opt/bin/hook' 'list' '-o' 'paths' '/a b.md'");
  });
});

// Mock child_process so we can intercept execSync for stdin/timeout tests.
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "mocked-output\n"),
}));

describe("runHook with options", () => {
  beforeEach(async () => {
    const cp = await import("node:child_process");
    (cp.execSync as unknown as ReturnType<typeof vi.fn>).mockClear();
    (cp.execSync as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => "mocked-output\n"
    );
  });

  it("passes input to execSync and uses pipe stdio when opts.stdin is set", async () => {
    const { runHook } = await import("../src/hookCli");
    const cp = await import("node:child_process");
    const execSyncMock = cp.execSync as unknown as ReturnType<typeof vi.fn>;

    const out = runHook("/opt/bin/hook", ["percent", "encode", "-"], {
      stdin: "hello world",
    });
    expect(out).toBe("mocked-output");
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const [, execOpts] = execSyncMock.mock.calls[0] as [
      string,
      { stdio: unknown[]; input?: string; timeout?: number },
    ];
    expect(execOpts.input).toBe("hello world");
    expect(execOpts.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(execOpts.timeout).toBe(60_000);
  });

  it("omits input and uses ignore stdio when opts is empty", async () => {
    const { runHook } = await import("../src/hookCli");
    const cp = await import("node:child_process");
    const execSyncMock = cp.execSync as unknown as ReturnType<typeof vi.fn>;

    runHook("/opt/bin/hook", ["clip", "/a.md"]);
    const [, execOpts] = execSyncMock.mock.calls[0] as [
      string,
      { stdio: unknown[]; input?: string; timeout?: number },
    ];
    expect(execOpts.input).toBeUndefined();
    expect(execOpts.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(execOpts.timeout).toBe(60_000);
  });

  it("respects opts.timeoutMs override", async () => {
    const { runHook } = await import("../src/hookCli");
    const cp = await import("node:child_process");
    const execSyncMock = cp.execSync as unknown as ReturnType<typeof vi.fn>;

    runHook("/opt/bin/hook", ["clip", "/a.md"], { timeoutMs: 5_000 });
    const [, execOpts] = execSyncMock.mock.calls[0] as [
      string,
      { timeout?: number },
    ];
    expect(execOpts.timeout).toBe(5_000);
  });
});
