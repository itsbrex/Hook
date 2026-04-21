export interface HookOption {
  short: string | null;
  long: string | null;
  description: string;
  valueArg: string | null;
}

export interface HookSubcommand {
  name: string;
  usage: string;
  description: string;
  options: HookOption[];
}

export interface HookCliSpec {
  generatedAt: string;
  hookVersion: string | null;
  subcommands: HookSubcommand[];
}
