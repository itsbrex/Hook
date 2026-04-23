import { describe, it, expect } from "vitest";
import { parseVerboseListing, parseVerboseFindListing } from "../src/verboseParser";

describe("parseVerboseListing", () => {
  it("parses a single-record block", () => {
    const input = [
      "Name: My Note",
      "Address: hook://file/ABC",
      "Path: /Users/me/note.md",
      "Hooked:",
      "  - hook://file/DEF",
      "  - hook://file/GHI",
      "",
    ].join("\n");
    expect(parseVerboseListing(input)).toEqual([
      {
        name: "My Note",
        address: "hook://file/ABC",
        path: "/Users/me/note.md",
        hooked: ["hook://file/DEF", "hook://file/GHI"],
      },
    ]);
  });

  it("parses multi-record block separated by blank line", () => {
    const input = [
      "Name: A",
      "Address: hook://file/A",
      "Path: /a",
      "Hooked:",
      "",
      "Name: B",
      "Address: hook://file/B",
      "Path: /b",
      "Hooked:",
      "  - hook://file/A",
    ].join("\n");
    const out = parseVerboseListing(input);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({
      name: "A",
      address: "hook://file/A",
      path: "/a",
      hooked: [],
    });
    expect(out[1]).toEqual({
      name: "B",
      address: "hook://file/B",
      path: "/b",
      hooked: ["hook://file/A"],
    });
  });

  it("returns [] for empty/whitespace input", () => {
    expect(parseVerboseListing("")).toEqual([]);
    expect(parseVerboseListing("\n\n   \n")).toEqual([]);
  });

  it("tolerates missing fields (sets to null/[])", () => {
    const input = "Name: Only\n";
    expect(parseVerboseListing(input)).toEqual([
      { name: "Only", address: null, path: null, hooked: [] },
    ]);
  });
});

describe("parseVerboseFindListing", () => {
  it("parses multi-record find output with dashed separators and Title: fields", () => {
    const input = [
      "Search results for: linkedin",
      "---------",
      "Title: attio-linkedin-userscript",
      "Path: /Users/hack/github/attio-linkedin-userscript",
      "Address: hook://file/7lkIC2naF?p=X&n=attio%2Dlinkedin",
      "---------------------",
      "Title: v0-attio-hubspot",
      "Path: /Users/hack/github/v0-attio-hubspot",
      "Address: hook://file/7lkLFXUUT?p=X&n=v0",
      "---------------------",
    ].join("\n");
    const out = parseVerboseFindListing(input);
    expect(out).toEqual([
      {
        name: "attio-linkedin-userscript",
        address: "hook://file/7lkIC2naF?p=X&n=attio%2Dlinkedin",
        path: "/Users/hack/github/attio-linkedin-userscript",
        hooked: [],
      },
      {
        name: "v0-attio-hubspot",
        address: "hook://file/7lkLFXUUT?p=X&n=v0",
        path: "/Users/hack/github/v0-attio-hubspot",
        hooked: [],
      },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseVerboseFindListing("")).toEqual([]);
  });

  it("returns [] when header-only with no records", () => {
    expect(
      parseVerboseFindListing("Search results for: xyz\n---------\n")
    ).toEqual([]);
  });

  it("handles trailing record without a final separator", () => {
    const input = [
      "Search results for: q",
      "---------",
      "Title: lonely",
      "Path: /p",
      "Address: hook://file/X",
    ].join("\n");
    expect(parseVerboseFindListing(input)).toEqual([
      { name: "lonely", address: "hook://file/X", path: "/p", hooked: [] },
    ]);
  });

  it("tolerates 'Name:' as alternative field (robust if Hookmark changes)", () => {
    const input = [
      "Search results for: x",
      "---------",
      "Name: alt",
      "Path: /a",
      "Address: hook://file/Y",
      "---------------------",
    ].join("\n");
    expect(parseVerboseFindListing(input)).toEqual([
      { name: "alt", address: "hook://file/Y", path: "/a", hooked: [] },
    ]);
  });
});
