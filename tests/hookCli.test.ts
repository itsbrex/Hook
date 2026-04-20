import { describe, expect, it, vi, beforeEach } from "vitest";
import { shellEscape, extractHookUrl, buildHookCommand } from "../src/hookCli";

describe("hookCli helpers", () => {
  it("quotes empty strings and escapes single quotes", () => {
    expect(shellEscape("")).toBe("''");
    expect(shellEscape("it's fine")).toBe("'it'\\''s fine'");
    expect(shellEscape("/Users/x/file.md")).toBe("'/Users/x/file.md'");
  });

  it("extracts hook:// URLs from CLI output", () => {
    expect(extractHookUrl("Copied hook://file/abc123 to clipboard")).toBe("hook://file/abc123");
    expect(extractHookUrl("nothing here")).toBeNull();
  });

  it("builds a shell-escaped command line", () => {
    const cmd = buildHookCommand("/opt/bin/hook", ["list", "-o", "paths", "/a b.md"]);
    expect(cmd).toBe("'/opt/bin/hook' 'list' '-o' 'paths' '/a b.md'");
  });
});
