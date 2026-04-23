import { describe, it, expect } from "vitest";
import { mergeAppleScriptSubcommands } from "../../src/applescript/merge";
import { buildAppleScriptSubcommands } from "../../src/applescript/subcommands";
import type { HookCliSpec } from "../../src/specTypes";

const EXPECTED_JXA_NAMES = [
  "all_bookmarks",
  "bookmark",
  "count_bookmarks",
  "exists_bookmark",
  "get_tags",
  "set_tags",
  "add_tags",
  "remove_tags",
  "bookmarks_with_tags",
  "rename_bookmark",
  "make_bookmark",
  "hook_bookmarks",
  "unhook_bookmarks",
  "from_active_window",
  "by_request_handle",
] as const;

const makeSpec = (names: string[]): HookCliSpec => ({
  generatedAt: "2026-04-23T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: names.map((name) => ({
    name,
    usage: `hookmark ${name}`,
    description: `${name} (CLI)`,
    options: [],
  })),
});

describe("mergeAppleScriptSubcommands", () => {
  it("appends all 15 JXA subcommands when skip=false on an empty spec", () => {
    const spec = makeSpec([]);
    mergeAppleScriptSubcommands(spec, false);

    expect(spec.subcommands).toHaveLength(15);
    const names = spec.subcommands.map((s) => s.name).sort();
    expect(names).toEqual([...EXPECTED_JXA_NAMES].sort());

    // Every newly added entry should have source "osascript"
    for (const sub of spec.subcommands) {
      expect(sub.source).toBe("osascript");
    }
  });

  it("is a no-op when skip=true", () => {
    const names = ["clip", "link", "list", "find", "remove"];
    const spec = makeSpec(names);
    mergeAppleScriptSubcommands(spec, true);

    expect(spec.subcommands).toHaveLength(5);
    expect(spec.subcommands.map((s) => s.name)).toEqual(names);
  });

  it("preserves existing CLI subcommands and appends JXA subs (skip=false)", () => {
    const cliNames = ["clip", "link", "list"];
    const spec = makeSpec(cliNames);
    mergeAppleScriptSubcommands(spec, false);

    expect(spec.subcommands).toHaveLength(3 + 15);

    const names = spec.subcommands.map((s) => s.name);
    for (const cli of cliNames) {
      expect(names).toContain(cli);
    }
    for (const jxa of EXPECTED_JXA_NAMES) {
      expect(names).toContain(jxa);
    }
  });

  it("is idempotent — calling twice yields the same 15-count as calling once", () => {
    const spec = makeSpec([]);
    mergeAppleScriptSubcommands(spec, false);
    mergeAppleScriptSubcommands(spec, false);

    expect(spec.subcommands).toHaveLength(15);
    expect(new Set(spec.subcommands.map((s) => s.name)).size).toBe(15);
  });

  it("returns the same spec reference", () => {
    const spec = makeSpec([]);
    expect(mergeAppleScriptSubcommands(spec, false)).toBe(spec);
    expect(mergeAppleScriptSubcommands(spec, true)).toBe(spec);
  });

  it("does not override existing entries with the same name", () => {
    // If a CLI sub somehow shares a name with a JXA sub, the CLI version wins.
    const spec = makeSpec(["bookmark"]);
    const originalBookmark = spec.subcommands[0];
    mergeAppleScriptSubcommands(spec, false);

    const bookmarks = spec.subcommands.filter((s) => s.name === "bookmark");
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]).toBe(originalBookmark);
    // Should have added the other 14 JXA subs
    expect(spec.subcommands).toHaveLength(15);
  });

  it("matches the JXA subcommand set produced by buildAppleScriptSubcommands()", () => {
    const spec = makeSpec([]);
    mergeAppleScriptSubcommands(spec, false);

    const built = buildAppleScriptSubcommands();
    const builtNames = built.map((s) => s.name).sort();
    const merged = spec.subcommands.map((s) => s.name).sort();
    expect(merged).toEqual(builtNames);
  });
});
