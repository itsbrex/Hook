import { describe, it, expect } from "vitest";
import {
  TEMPLATE_ALL_BOOKMARKS,
  TEMPLATE_BOOKMARK_BY_PATH,
  TEMPLATE_COUNT_BOOKMARKS,
  TEMPLATE_EXISTS_BOOKMARK,
  TEMPLATE_GET_TAGS,
  TEMPLATE_SET_TAGS,
  TEMPLATE_ADD_TAGS,
  TEMPLATE_REMOVE_TAGS,
  TEMPLATE_BOOKMARKS_WITH_TAGS,
} from "../../src/applescript/templates";

describe("JXA templates", () => {
  describe("TEMPLATE_ALL_BOOKMARKS", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_ALL_BOOKMARKS).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_ALL_BOOKMARKS).toContain("JSON.stringify");
    });

    it("enumerates bookmarks via .bookmarks()", () => {
      expect(TEMPLATE_ALL_BOOKMARKS).toContain(".bookmarks()");
    });

    it("includes the expected fields", () => {
      expect(TEMPLATE_ALL_BOOKMARKS).toContain("name");
      expect(TEMPLATE_ALL_BOOKMARKS).toContain("path");
      expect(TEMPLATE_ALL_BOOKMARKS).toContain("address");
      expect(TEMPLATE_ALL_BOOKMARKS).toContain("tags");
      expect(TEMPLATE_ALL_BOOKMARKS).toContain("hookedCount");
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_ALL_BOOKMARKS).toBe(TEMPLATE_ALL_BOOKMARKS.trim());
      expect(TEMPLATE_ALL_BOOKMARKS.length).toBeGreaterThan(0);
    });
  });

  describe("TEMPLATE_BOOKMARK_BY_PATH", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("JSON.stringify");
    });

    it("accepts argv via run(argv) entry point", () => {
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("run(argv)");
    });

    it("reads the first argv element", () => {
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("argv[0]");
    });

    it("includes the expected fields", () => {
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("name");
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("path");
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("address");
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("tags");
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("hookedCount");
    });

    it("uses the whose-filter pattern, not bookmarkFrom", () => {
      expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("whose");
      expect(TEMPLATE_BOOKMARK_BY_PATH).not.toContain("bookmarkFrom");
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_BOOKMARK_BY_PATH).toBe(TEMPLATE_BOOKMARK_BY_PATH.trim());
    });
  });

  describe("TEMPLATE_COUNT_BOOKMARKS", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_COUNT_BOOKMARKS).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_COUNT_BOOKMARKS).toContain("JSON.stringify");
    });

    it("uses .bookmarks().length", () => {
      expect(TEMPLATE_COUNT_BOOKMARKS).toContain(".bookmarks()");
      expect(TEMPLATE_COUNT_BOOKMARKS).toContain(".length");
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_COUNT_BOOKMARKS).toBe(TEMPLATE_COUNT_BOOKMARKS.trim());
    });
  });

  describe("TEMPLATE_EXISTS_BOOKMARK", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toContain("JSON.stringify");
    });

    it("accepts argv via run(argv) entry point", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toContain("run(argv)");
    });

    it("reads the first argv element", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toContain("argv[0]");
    });

    it("uses the whose-filter pattern, not bookmarkFrom", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toContain("whose");
      expect(TEMPLATE_EXISTS_BOOKMARK).not.toContain("bookmarkFrom");
    });

    it("returns a boolean based on match count", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toContain("matches.length");
      expect(TEMPLATE_EXISTS_BOOKMARK).toMatch(/JSON\.stringify\(matches\.length > 0\)/);
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toBe(TEMPLATE_EXISTS_BOOKMARK.trim());
    });
  });

  describe("TEMPLATE_GET_TAGS", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_GET_TAGS).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_GET_TAGS).toContain("JSON.stringify");
    });

    it("accepts argv via run(argv) entry point", () => {
      expect(TEMPLATE_GET_TAGS).toContain("run(argv)");
    });

    it("reads the first argv element as path", () => {
      expect(TEMPLATE_GET_TAGS).toContain("argv[0]");
    });

    it("uses the whose-filter pattern", () => {
      expect(TEMPLATE_GET_TAGS).toContain("whose");
    });

    it("reads tags via .tags() getter", () => {
      expect(TEMPLATE_GET_TAGS).toContain(".tags()");
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_GET_TAGS).toBe(TEMPLATE_GET_TAGS.trim());
      expect(TEMPLATE_GET_TAGS.length).toBeGreaterThan(0);
    });
  });

  describe("TEMPLATE_SET_TAGS", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_SET_TAGS).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_SET_TAGS).toContain("JSON.stringify");
    });

    it("accepts argv via run(argv) entry point", () => {
      expect(TEMPLATE_SET_TAGS).toContain("run(argv)");
    });

    it("reads path from argv[0] and csv from argv[1]", () => {
      expect(TEMPLATE_SET_TAGS).toContain("argv[0]");
      expect(TEMPLATE_SET_TAGS).toContain("argv[1]");
    });

    it("uses the whose-filter pattern", () => {
      expect(TEMPLATE_SET_TAGS).toContain("whose");
    });

    it("parses CSV via .split(',')", () => {
      expect(TEMPLATE_SET_TAGS).toContain('.split(",")');
    });

    it("writes tags via property assignment (not a method call)", () => {
      expect(TEMPLATE_SET_TAGS).toMatch(/\.tags\s*=/);
    });

    it("reads back tags via .tags() getter after write", () => {
      expect(TEMPLATE_SET_TAGS).toContain(".tags()");
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_SET_TAGS).toBe(TEMPLATE_SET_TAGS.trim());
      expect(TEMPLATE_SET_TAGS.length).toBeGreaterThan(0);
    });
  });

  describe("TEMPLATE_ADD_TAGS", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_ADD_TAGS).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_ADD_TAGS).toContain("JSON.stringify");
    });

    it("accepts argv via run(argv) entry point", () => {
      expect(TEMPLATE_ADD_TAGS).toContain("run(argv)");
    });

    it("reads path from argv[0] and csv from argv[1]", () => {
      expect(TEMPLATE_ADD_TAGS).toContain("argv[0]");
      expect(TEMPLATE_ADD_TAGS).toContain("argv[1]");
    });

    it("uses the whose-filter pattern", () => {
      expect(TEMPLATE_ADD_TAGS).toContain("whose");
    });

    it("parses CSV via .split(',')", () => {
      expect(TEMPLATE_ADD_TAGS).toContain('.split(",")');
    });

    it("reads current tags via .tags() getter", () => {
      expect(TEMPLATE_ADD_TAGS).toContain(".tags()");
    });

    it("writes tags via property assignment (not a method call)", () => {
      expect(TEMPLATE_ADD_TAGS).toMatch(/\.tags\s*=/);
    });

    it("performs union-merge (skips duplicates via filter)", () => {
      expect(TEMPLATE_ADD_TAGS).toContain("filter");
      expect(TEMPLATE_ADD_TAGS).toMatch(/!\s*current\.includes\(t\)/);
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_ADD_TAGS).toBe(TEMPLATE_ADD_TAGS.trim());
      expect(TEMPLATE_ADD_TAGS.length).toBeGreaterThan(0);
    });
  });

  describe("TEMPLATE_REMOVE_TAGS", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_REMOVE_TAGS).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_REMOVE_TAGS).toContain("JSON.stringify");
    });

    it("accepts argv via run(argv) entry point", () => {
      expect(TEMPLATE_REMOVE_TAGS).toContain("run(argv)");
    });

    it("reads path from argv[0] and csv from argv[1]", () => {
      expect(TEMPLATE_REMOVE_TAGS).toContain("argv[0]");
      expect(TEMPLATE_REMOVE_TAGS).toContain("argv[1]");
    });

    it("uses the whose-filter pattern", () => {
      expect(TEMPLATE_REMOVE_TAGS).toContain("whose");
    });

    it("parses CSV via .split(',')", () => {
      expect(TEMPLATE_REMOVE_TAGS).toContain('.split(",")');
    });

    it("reads current tags via .tags() getter", () => {
      expect(TEMPLATE_REMOVE_TAGS).toContain(".tags()");
    });

    it("writes tags via property assignment (not a method call)", () => {
      expect(TEMPLATE_REMOVE_TAGS).toMatch(/\.tags\s*=/);
    });

    it("filters out the given tags", () => {
      expect(TEMPLATE_REMOVE_TAGS).toContain("filter");
      expect(TEMPLATE_REMOVE_TAGS).toMatch(/!\s*toRemove\.includes\(t\)/);
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_REMOVE_TAGS).toBe(TEMPLATE_REMOVE_TAGS.trim());
      expect(TEMPLATE_REMOVE_TAGS.length).toBeGreaterThan(0);
    });
  });

  describe("TEMPLATE_BOOKMARKS_WITH_TAGS", () => {
    it("targets the Hookmark application", () => {
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain('Application("Hookmark")');
    });

    it("emits JSON via JSON.stringify", () => {
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("JSON.stringify");
    });

    it("accepts argv via run(argv) entry point", () => {
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("run(argv)");
    });

    it("reads csv from argv[0]", () => {
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("argv[0]");
    });

    it("parses CSV via .split(',')", () => {
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain('.split(",")');
    });

    it("uses bookmarksWithTags positional array form", () => {
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("bookmarksWithTags");
    });

    it("maps results to {name, path, address} objects", () => {
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("name: b.name()");
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("path: b.path()");
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("address: b.address()");
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toBe(
        TEMPLATE_BOOKMARKS_WITH_TAGS.trim()
      );
      expect(TEMPLATE_BOOKMARKS_WITH_TAGS.length).toBeGreaterThan(0);
    });
  });
});
