import { describe, it, expect } from "vitest";
import {
  TEMPLATE_ALL_BOOKMARKS,
  TEMPLATE_BOOKMARK_BY_PATH,
  TEMPLATE_COUNT_BOOKMARKS,
  TEMPLATE_EXISTS_BOOKMARK,
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

    it("returns boolean literals via try/catch", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toContain("try");
      expect(TEMPLATE_EXISTS_BOOKMARK).toContain("catch");
      expect(TEMPLATE_EXISTS_BOOKMARK).toMatch(/JSON\.stringify\(true\)/);
      expect(TEMPLATE_EXISTS_BOOKMARK).toMatch(/JSON\.stringify\(false\)/);
    });

    it("is a trimmed string", () => {
      expect(TEMPLATE_EXISTS_BOOKMARK).toBe(TEMPLATE_EXISTS_BOOKMARK.trim());
    });
  });
});
