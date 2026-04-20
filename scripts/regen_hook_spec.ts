#!/usr/bin/env node
import path from "node:path";
import { getConfig } from "../src/config.js";
import { regenHookSpec } from "../src/regenSpec.js";

export * from "../src/regenSpec.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = getConfig(process.env);
  const specPath = path.resolve("docs/reference/hook-cli-spec.json");
  const previousPath = path.resolve("docs/reference/hook-cli-spec.previous.json");
  const { changed } = regenHookSpec({ hookCli: cfg.hookCli, specPath, previousPath });
  process.stderr.write(changed ? "[regen] spec updated\n" : "[regen] no changes\n");
}
