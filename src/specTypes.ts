export interface HookOption {
  short: string | null;
  long: string | null;
  description: string;
  valueArg: string | null;
}

export type HookSubcommandSource = "cli" | "osascript";

export interface HookSubcommand {
  name: string;
  usage: string;
  description: string;
  options: HookOption[];
  cliArgs?: string[];
  aliases?: string[];
  /** Dispatch backend. Defaults to "cli" when absent. */
  source?: HookSubcommandSource;
  /** AppleScript source, used when source === "osascript". */
  appleScriptSource?: string;
  /** Name of the parser in src/applescript/parse.ts to apply to stdout. */
  appleScriptParser?: string;
}

export interface HookCliSpec {
  generatedAt: string;
  hookVersion: string | null;
  subcommands: HookSubcommand[];
}
