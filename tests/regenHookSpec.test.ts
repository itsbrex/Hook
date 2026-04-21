import { describe, expect, it } from "vitest";
import { parseHookHelpOutput, buildSpecFromHelp } from "../src/regenSpec";

// Real output of `hook help clip` from hook 2.1.3. Man-page format, uppercase
// section headers — this is what the regen script actually has to consume.
const CLIP_HELP = `NAME
    clip - Copy Hookmark URL for file/url to clipboard

SYNOPSIS

    hook [global options] clip [command options] FILE_OR_URL



DESCRIPTION
    Creates a bookmark for the specified file or URL and copies its Hookmark URL
    to the clipboard.

    The copied Hookmark URL can be used to link to other files (use \`hook link
    --paste FILE/URL\`, or to paste into another app as a link. Use the -m flag
    to copy a full Markdown link.



COMMAND OPTIONS
    -a, --app=APP_NAME - Copy from application (default: none)
    -m, --markdown     - Copy as Markdown
`;

const LIST_HELP = `NAME
    list - List hooks on a file or url

SYNOPSIS

    hook [global options] list [command options] [FILE_OR_URL]...

COMMAND OPTIONS
    -f, --files_only           - Output only bookmarks with file paths
    --null                     - Separate results with NULL separator
    -o, --output_format=FORMAT - Output format (default: paths)
    -s, --[no-]select          - Generate a menu to select hook(s) for opening
`;

describe("regen_hook_spec parser", () => {
  it("parses man-page style help emitted by hook 2.1.3", () => {
    const parsed = parseHookHelpOutput("clip", CLIP_HELP);
    expect(parsed.name).toBe("clip");
    expect(parsed.usage).toBe("hook clip FILE_OR_URL");
    expect(parsed.description).toContain("Creates a bookmark for the specified file or URL");
    expect(parsed.options).toEqual([
      { short: "-a", long: "--app", description: "Copy from application (default: none)", valueArg: "APP_NAME" },
      { short: "-m", long: "--markdown", description: "Copy as Markdown", valueArg: null },
    ]);
  });

  it("handles bracketed/variadic positionals and options with no short form", () => {
    const parsed = parseHookHelpOutput("list", LIST_HELP);
    expect(parsed.usage).toBe("hook list [FILE_OR_URL]...");
    const longs = parsed.options.map((o) => o.long);
    expect(longs).toContain("--files_only");
    expect(longs).toContain("--null");
    expect(longs).toContain("--output_format");
    // [no-]select is normalized to --select for round-tripping as a boolean flag.
    expect(longs).toContain("--select");
    const nullOpt = parsed.options.find((o) => o.long === "--null");
    expect(nullOpt?.short).toBeNull();
  });

  it("rolls up multiple subcommands into a checked-in spec shape", () => {
    const spec = buildSpecFromHelp({ clip: CLIP_HELP, list: LIST_HELP });
    expect(spec.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(spec.subcommands.map((s) => s.name)).toEqual(["clip", "list"]);
  });

  it("captures =VALUE metadata on flags that take a value", () => {
    const parsed = parseHookHelpOutput("clip", CLIP_HELP);
    const app = parsed.options.find((o) => o.long === "--app");
    expect(app?.valueArg).toBe("APP_NAME");
    const markdown = parsed.options.find((o) => o.long === "--markdown");
    expect(markdown?.valueArg).toBeNull();
  });
});

const PERCENT_ENCODE_HELP = `NAME
    encode - percent encode a string

SYNOPSIS

    hook [global options] percent encode STRING
`;

describe("sub-subcommand parsing", () => {
  it("builds a percent_encode entry with cliArgs prefix", () => {
    const parsed = parseHookHelpOutput("percent_encode", PERCENT_ENCODE_HELP);
    expect(parsed.usage).toBe("hook percent encode STRING");
  });
});
