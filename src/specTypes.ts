export interface HookOption {
  short: string | null;
  long: string | null;
  description: string;
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
