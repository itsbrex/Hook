import { describe, it, expect } from "vitest";
import { parseVerboseListing } from "../src/verboseParser";

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
