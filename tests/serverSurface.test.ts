// tests/serverSurface.test.ts
import { describe, expect, it } from "vitest";
import { TOOL_NAMES, buildUsageGuide } from "../src/index";

describe("server surface", () => {
  it("exposes exactly the 9 code-mode meta-tools", () => {
    expect(TOOL_NAMES).toEqual([
      "register_manual",
      "deregister_manual",
      "search_tools",
      "list_tools",
      "changelog",
      "tools_info",
      "get_all_tool_interfaces",
      "get_required_keys_for_tool",
      "call_tool_chain",
    ]);
  });

  it("teaches hook.<subcommand>() usage", () => {
    const guide = buildUsageGuide();
    expect(guide).toContain("hook.clip");
    expect(guide).toContain("hook.link");
    expect(guide).toContain("call_tool_chain");
    expect(guide).toContain("body:");
    expect(guide).not.toContain("return await hook.clip({ item:");
  });
});
