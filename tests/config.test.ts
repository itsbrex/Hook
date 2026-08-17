import { describe, expect, it } from "vitest";
import { getConfig, resolveHookCli, defaultCandidateHookPaths } from "../src/config";

const noPath = () => null;
const noFiles = () => false;

describe("config", () => {
  it("HOOK_CLI env var takes precedence over everything", () => {
    const c = getConfig(
      { HOOK_CLI: "/custom/path/hook" },
      { lookupOnPath: () => "/opt/homebrew/bin/hook", fileExists: () => true }
    );
    expect(c.hookCli).toBe("/custom/path/hook");
  });

  it("prefers PATH lookup when it resolves", () => {
    const resolved = resolveHookCli(
      {},
      {
        lookupOnPath: () => "/opt/homebrew/bin/hook",
        fileExists: (p) => p === "/opt/homebrew/bin/hook",
      }
    );
    expect(resolved).toBe("/opt/homebrew/bin/hook");
  });

  it("falls back to the first existing known candidate", () => {
    const resolved = resolveHookCli(
      {},
      {
        lookupOnPath: noPath,
        candidates: () => ["/usr/local/bin/hook", "/opt/homebrew/bin/hook"],
        fileExists: (p) => p === "/opt/homebrew/bin/hook",
      }
    );
    expect(resolved).toBe("/opt/homebrew/bin/hook");
  });

  it("supports system Ruby sudo install at /usr/local/bin/hook", () => {
    const resolved = resolveHookCli(
      {},
      {
        lookupOnPath: noPath,
        fileExists: (p) => p === "/usr/local/bin/hook",
      }
    );
    expect(resolved).toBe("/usr/local/bin/hook");
  });

  it("supports --user-install under ~/.gem", () => {
    const home = process.env.HOME || "/Users/test";
    const target = `${home}/.gem/ruby/2.6.0/bin/hook`;
    const resolved = resolveHookCli(
      {},
      {
        lookupOnPath: noPath,
        fileExists: (p) => p === target,
      }
    );
    expect(resolved).toBe(target);
  });

  it("returns bare 'hook' when nothing is found", () => {
    const resolved = resolveHookCli(
      {},
      { lookupOnPath: noPath, fileExists: noFiles }
    );
    expect(resolved).toBe("hook");
  });

  it("ignores a PATH result that does not exist on disk", () => {
    const resolved = resolveHookCli(
      {},
      {
        lookupOnPath: () => "/stale/hook",
        candidates: () => ["/opt/homebrew/bin/hook"],
        fileExists: (p) => p === "/opt/homebrew/bin/hook",
      }
    );
    expect(resolved).toBe("/opt/homebrew/bin/hook");
  });

  it("default candidate list covers known install locations", () => {
    const list = defaultCandidateHookPaths("/Users/test");
    expect(list).toContain("/opt/homebrew/bin/hook");
    expect(list).toContain("/usr/local/bin/hook");
    expect(list).toContain("/usr/bin/hook");
    expect(list).toContain("/Users/test/.gem/ruby/2.6.0/bin/hook");
    expect(list).toContain("/Users/test/.rbenv/shims/hook");
    expect(list).toContain("/Users/test/.asdf/shims/hook");
    expect(list).toContain("/opt/local/bin/hook");
  });

  it("respects non-hookCli overrides", () => {
    const c = getConfig(
      {
        HOOK_CLI: "/usr/local/bin/hook",
        HOOK_BRIDGE_PORT: "4000",
        HOOK_TIMEOUT_MS: "90000",
        HOOK_SKIP_REGEN: "1",
        HOOK_CHANGELOG_AUTO_OPEN: "0",
      },
      { fileExists: () => true, lookupOnPath: () => null }
    );
    expect(c.hookCli).toBe("/usr/local/bin/hook");
    expect(c.bridgePort).toBe(4000);
    expect(c.defaultTimeoutMs).toBe(90_000);
    expect(c.skipRegen).toBe(true);
    expect(c.changelogAutoOpen).toBe(false);
  });

  it("defaults to an ephemeral bridge port", () => {
    const c = getConfig({}, { lookupOnPath: noPath, fileExists: noFiles });
    expect(c.bridgePort).toBe(0);
  });

  it("defaults executor timeout to 60 seconds", () => {
    const c = getConfig({}, { lookupOnPath: noPath, fileExists: noFiles });
    expect(c.defaultTimeoutMs).toBe(60_000);
  });

  it("falls back to 60 seconds for invalid executor timeout values", () => {
    for (const value of ["", "not-a-number", "0", "-1", "1.5"]) {
      const c = getConfig(
        { HOOK_TIMEOUT_MS: value },
        { lookupOnPath: noPath, fileExists: noFiles }
      );
      expect(c.defaultTimeoutMs).toBe(60_000);
    }
  });
});

describe("config.skipApplescript", () => {
  it("defaults to false when HOOK_SKIP_APPLESCRIPT is unset", () => {
    const cfg = getConfig({}, {
      fileExists: () => true,
      lookupOnPath: () => "/usr/bin/hook",
      candidates: () => [],
    });
    expect(cfg.skipApplescript).toBe(false);
  });

  it("is true when HOOK_SKIP_APPLESCRIPT=1", () => {
    const cfg = getConfig(
      { HOOK_SKIP_APPLESCRIPT: "1" },
      {
        fileExists: () => true,
        lookupOnPath: () => "/usr/bin/hook",
        candidates: () => [],
      }
    );
    expect(cfg.skipApplescript).toBe(true);
  });

  it("is false for HOOK_SKIP_APPLESCRIPT=0 (explicit off)", () => {
    const cfg = getConfig(
      { HOOK_SKIP_APPLESCRIPT: "0" },
      {
        fileExists: () => true,
        lookupOnPath: () => "/usr/bin/hook",
        candidates: () => [],
      }
    );
    expect(cfg.skipApplescript).toBe(false);
  });
});
