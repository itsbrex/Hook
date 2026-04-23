import type { HookCliSpec } from "../specTypes.js";
import { buildAppleScriptSubcommands } from "./subcommands.js";

/**
 * Append virtual JXA-backed subcommands to a spec, in-place.
 *
 * @param spec - the loaded HookCliSpec; mutated to include JXA subcommands
 * @param skip - if true, no-op (e.g. Automation permission denied, Hookmark not running)
 * @returns the same spec reference (for fluent use)
 */
export function mergeAppleScriptSubcommands(
  spec: HookCliSpec,
  skip: boolean,
): HookCliSpec {
  if (skip) return spec;
  const jxaSubs = buildAppleScriptSubcommands();
  // Guard against duplicates if merge is called twice, or if a CLI
  // subcommand collides with a JXA name (existing entries win).
  const existingNames = new Set(spec.subcommands.map((s) => s.name));
  for (const sub of jxaSubs) {
    if (!existingNames.has(sub.name)) {
      spec.subcommands.push(sub);
      existingNames.add(sub.name);
    }
  }
  return spec;
}
