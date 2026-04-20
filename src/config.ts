export interface RuntimeConfig {
  hookCli: string;
  bridgePort: number;
  skipRegen: boolean;
  changelogAutoOpen: boolean;
}

const DEFAULT_HOOK_CLI = "/opt/homebrew/lib/ruby/gems/4.0.0/bin/hook";
const DEFAULT_BRIDGE_PORT = 3801;

export function getConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): RuntimeConfig {
  return {
    hookCli: env.HOOK_CLI ?? DEFAULT_HOOK_CLI,
    bridgePort: Number(env.HOOK_BRIDGE_PORT ?? DEFAULT_BRIDGE_PORT),
    skipRegen: env.HOOK_SKIP_REGEN === "1",
    changelogAutoOpen: env.HOOK_CHANGELOG_AUTO_OPEN !== "0",
  };
}
