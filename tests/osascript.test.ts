import { describe, it, expect } from "vitest";
import { shellEscapeArg, runOsascript, OsascriptError } from "../src/osascript";

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

describe("runOsascript", () => {
  it("executes a trivial AppleScript and returns stdout", () => {
    const out = runOsascript('return "hello"');
    expect(out.trim()).toBe('"hello"'); // -ss quotes strings
  });

  it("substitutes args via argv", () => {
    const out = runOsascript(
      'on run argv\n  return item 1 of argv & "-" & item 2 of argv\nend run',
      { args: ["foo", "bar"] }
    );
    expect(out.trim()).toBe('"foo-bar"');
  });

  it("throws OsascriptError with stderr on script failure", () => {
    expect(() => runOsascript('error "nope" number -128')).toThrow(
      OsascriptError
    );
  });

  it("wraps unknown-app errors as OsascriptError", () => {
    try {
      runOsascript('tell application "NonexistentApp12345" to activate');
      throw new Error("expected runOsascript to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(OsascriptError);
    }
  });
});
