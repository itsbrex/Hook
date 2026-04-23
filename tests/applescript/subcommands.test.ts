import { describe, it, expect } from "vitest";
import { buildAppleScriptSubcommands } from "../../src/applescript/subcommands";

const EXPECTED_NAMES = [
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

describe("buildAppleScriptSubcommands", () => {
  it("returns exactly the 15 expected subcommand names", () => {
    const subs = buildAppleScriptSubcommands();
    const names = subs.map((s) => s.name).sort();
    expect(names).toEqual([...EXPECTED_NAMES].sort());
  });

  it("produces no duplicate names", () => {
    const subs = buildAppleScriptSubcommands();
    expect(new Set(subs.map((s) => s.name)).size).toBe(subs.length);
  });

  it("marks every entry with source: 'osascript'", () => {
    for (const s of buildAppleScriptSubcommands()) {
      expect(s.source).toBe("osascript");
    }
  });

  it("attaches a non-empty appleScriptSource string to every entry", () => {
    for (const s of buildAppleScriptSubcommands()) {
      expect(typeof s.appleScriptSource).toBe("string");
      expect(s.appleScriptSource && s.appleScriptSource.length).toBeGreaterThan(0);
    }
  });

  it("never sets appleScriptParser (JXA-era invariant)", () => {
    for (const s of buildAppleScriptSubcommands()) {
      expect(s.appleScriptParser).toBeUndefined();
    }
  });

  it("sets an empty options array on every entry", () => {
    for (const s of buildAppleScriptSubcommands()) {
      expect(s.options).toEqual([]);
    }
  });

  it("wires a template referencing Application(\"Hookmark\") and JSON.stringify for each entry", () => {
    for (const s of buildAppleScriptSubcommands()) {
      expect(s.appleScriptSource).toContain('Application("Hookmark")');
      expect(s.appleScriptSource).toContain("JSON.stringify");
    }
  });

  describe("usage positional declarations", () => {
    const get = (name: string) => {
      const sub = buildAppleScriptSubcommands().find((s) => s.name === name);
      if (!sub) throw new Error(`missing subcommand ${name}`);
      return sub;
    };

    it("bookmark usage declares FILE_OR_URL", () => {
      expect(get("bookmark").usage).toContain("FILE_OR_URL");
    });

    it("set_tags usage declares FILE_OR_URL and TAGS", () => {
      const u = get("set_tags").usage;
      expect(u).toContain("FILE_OR_URL");
      expect(u).toContain("TAGS");
    });

    it("add_tags usage declares FILE_OR_URL and TAGS", () => {
      const u = get("add_tags").usage;
      expect(u).toContain("FILE_OR_URL");
      expect(u).toContain("TAGS");
    });

    it("remove_tags usage declares FILE_OR_URL and TAGS", () => {
      const u = get("remove_tags").usage;
      expect(u).toContain("FILE_OR_URL");
      expect(u).toContain("TAGS");
    });

    it("bookmarks_with_tags usage declares TAGS", () => {
      expect(get("bookmarks_with_tags").usage).toContain("TAGS");
    });

    it("rename_bookmark usage declares FILE_OR_URL and NEW_NAME", () => {
      const u = get("rename_bookmark").usage;
      expect(u).toContain("FILE_OR_URL");
      expect(u).toContain("NEW_NAME");
    });

    it("make_bookmark usage declares NAME, ADDRESS, and [TAGS]", () => {
      const u = get("make_bookmark").usage;
      expect(u).toContain("NAME");
      expect(u).toContain("ADDRESS");
      expect(u).toContain("[TAGS]");
    });

    it("hook_bookmarks usage declares FILE_OR_URL_A and FILE_OR_URL_B", () => {
      const u = get("hook_bookmarks").usage;
      expect(u).toContain("FILE_OR_URL_A");
      expect(u).toContain("FILE_OR_URL_B");
    });

    it("unhook_bookmarks usage declares FILE_OR_URL_A and FILE_OR_URL_B", () => {
      const u = get("unhook_bookmarks").usage;
      expect(u).toContain("FILE_OR_URL_A");
      expect(u).toContain("FILE_OR_URL_B");
    });

    it("by_request_handle usage declares HANDLE_ID", () => {
      expect(get("by_request_handle").usage).toContain("HANDLE_ID");
    });

    const NO_POSITIONALS = /FILE_OR_URL|TAGS|NAME|ADDRESS|HANDLE_ID|NEW_NAME/;

    it("all_bookmarks usage has no positional placeholder", () => {
      expect(get("all_bookmarks").usage).not.toMatch(NO_POSITIONALS);
    });

    it("count_bookmarks usage has no positional placeholder", () => {
      expect(get("count_bookmarks").usage).not.toMatch(NO_POSITIONALS);
    });

    it("from_active_window usage has no positional placeholder", () => {
      expect(get("from_active_window").usage).not.toMatch(NO_POSITIONALS);
    });
  });
});
