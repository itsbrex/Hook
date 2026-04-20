import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config";

describe("config", () => {
  it("returns Hook defaults when env is empty", () => {
    const c = getConfig({});
    expect(c.hookCli).toBe("/opt/homebrew/lib/ruby/gems/4.0.0/bin/hook");
    expect(c.bridgePort).toBe(3801);
    expect(c.skipRegen).toBe(false);
    expect(c.changelogAutoOpen).toBe(true);
  });

  it("respects overrides", () => {
    const c = getConfig({
      HOOK_CLI: "/usr/local/bin/hook",
      HOOK_BRIDGE_PORT: "4000",
      HOOK_SKIP_REGEN: "1",
      HOOK_CHANGELOG_AUTO_OPEN: "0",
    });
    expect(c.hookCli).toBe("/usr/local/bin/hook");
    expect(c.bridgePort).toBe(4000);
    expect(c.skipRegen).toBe(true);
    expect(c.changelogAutoOpen).toBe(false);
  });
});
