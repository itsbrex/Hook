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

describe("runOsascript language option", () => {
  it("executes JavaScript (JXA) when language is 'javascript'", () => {
    // JSON.stringify(2) returns the string "2"; JXA prints that to stdout + newline.
    const out = runOsascript("JSON.stringify(1 + 1)", { language: "javascript" });
    expect(out.trim()).toBe("2");
  });

  it("returns JSON-encoded strings with quotes under JXA", () => {
    // JSON.stringify("hello") returns the JSON-encoded string '"hello"'.
    const out = runOsascript('JSON.stringify("hello")', {
      language: "javascript",
    });
    expect(out.trim()).toBe('"hello"');
  });

  it("defaults to applescript when language is unset", () => {
    // Verify the existing -ss behavior still holds (AppleScript-style quoted output).
    const out = runOsascript('return "hello"');
    expect(out.trim()).toBe('"hello"');
  });

  it("passes argv to JavaScript via function run(argv)", () => {
    const script =
      "function run(argv) { return JSON.stringify({echoed: argv[0]}); }";
    const out = runOsascript(script, {
      language: "javascript",
      args: ["hello"],
    });
    expect(JSON.parse(out.trim())).toEqual({ echoed: "hello" });
  });
});
