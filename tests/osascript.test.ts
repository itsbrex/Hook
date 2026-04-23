import { describe, it, expect } from "vitest";
import { shellEscapeArg } from "../src/osascript";

describe("shellEscapeArg", () => {
  it("wraps plain strings in single quotes", () => {
    expect(shellEscapeArg("hello")).toBe("'hello'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellEscapeArg("it's fine")).toBe("'it'\\''s fine'");
  });

  it("handles empty string", () => {
    expect(shellEscapeArg("")).toBe("''");
  });

  it("handles paths with spaces", () => {
    expect(shellEscapeArg("/Users/me/My Docs/a.md")).toBe(
      "'/Users/me/My Docs/a.md'"
    );
  });
});
