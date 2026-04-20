import { describe, expect, it } from "vitest";
import { parseHookHelpOutput, buildSpecFromHelp } from "../scripts/regen_hook_spec";

const CLIP_HELP = `Usage: hook clip ITEM

Description:
  Generate a hook:// URL for ITEM and copy it to the clipboard.

Options:
  -m, --markdown    Return a Markdown link instead of a bare hook:// URL
`;

describe("regen_hook_spec parser", () => {
  it("extracts usage, description, options from a single subcommand", () => {
    const parsed = parseHookHelpOutput("clip", CLIP_HELP);
    expect(parsed.name).toBe("clip");
    expect(parsed.usage).toContain("hook clip ITEM");
    expect(parsed.description).toContain("Generate a hook:// URL");
    expect(parsed.options).toEqual([
      {
        short: "-m",
        long: "--markdown",
        description: "Return a Markdown link instead of a bare hook:// URL",
      },
    ]);
  });

  it("rolls up multiple subcommands into a checked-in spec shape", () => {
    const spec = buildSpecFromHelp({ clip: CLIP_HELP });
    expect(spec.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(spec.subcommands.map((s) => s.name)).toEqual(["clip"]);
  });
});
