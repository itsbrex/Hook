import { describe, it, expectTypeOf } from "vitest";
import type { HookSubcommand } from "../src/specTypes";

describe("HookSubcommand", () => {
  it("accepts source: 'cli' (backward compat — optional field)", () => {
    const s: HookSubcommand = {
      name: "clip",
      usage: "hook clip ITEM",
      description: "",
      options: [],
    };
    expectTypeOf(s).toMatchTypeOf<HookSubcommand>();
  });

  it("accepts source: 'osascript' with appleScriptSource + parser", () => {
    const s: HookSubcommand = {
      name: "all_bookmarks",
      usage: "hookmark all bookmarks",
      description: "Return every bookmark",
      options: [],
      source: "osascript",
      appleScriptSource: 'tell application "Hookmark" to return allBookmarks',
      appleScriptParser: "bookmark_list",
    };
    expectTypeOf(s).toMatchTypeOf<HookSubcommand>();
  });
});
