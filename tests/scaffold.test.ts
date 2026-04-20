import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("project scaffold", () => {
  it("declares code-mode deps and test/dev scripts", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.type).toBe("module");
    expect(pkg.version).toBe("0.2.0");
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.dev).toBe("tsx src/index.ts");
    expect(pkg.scripts["regen-spec"]).toBe("tsx scripts/regen_hook_spec.ts");
    for (const dep of [
      "@utcp/code-mode",
      "@utcp/sdk",
      "@utcp/http",
      "@utcp/dotenv-loader",
      "dotenv",
    ]) {
      expect(pkg.dependencies[dep]).toBeDefined();
    }
    for (const dep of ["vitest", "tsx"]) {
      expect(pkg.devDependencies[dep]).toBeDefined();
    }
  });
});
