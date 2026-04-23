#!/usr/bin/env tsx
/**
 * scripts/smoke.ts — End-to-end smoke test for hookmark-mcp v0.3.0
 *
 * Run manually with:
 *   npx tsx scripts/smoke.ts
 *
 * Prerequisites:
 *   - Hookmark.app installed and running (for full JXA path coverage)
 *   - macOS Automation permission granted to whatever terminal runs this
 *
 * What it does:
 *   1. Runs `bun run build` so dist/ is fresh.
 *   2. Spawns `node dist/index.js` and watches stderr for the bridge port.
 *   3. Hits GET /openapi and POST /list (empty + json=true) and validates shapes.
 *   4. Sends SIGTERM and waits for exit.
 *   5. Exits 0 on success, 1 on any failure.
 *
 * Safety: all operations exercised here are READ-ONLY against Hookmark.
 * Do NOT extend this to mutation subcommands without a fixture + cleanup plan.
 */

import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

type CheckResult = { name: string; ok: boolean; detail?: string };
const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const mark = ok ? "✓" : "✗";
  const line = detail ? `${mark} ${name} — ${detail}` : `${mark} ${name}`;
  process.stdout.write(line + "\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<number> {
  // 1. Build
  process.stdout.write("[smoke] Building…\n");
  try {
    execSync("bun run build", { cwd: REPO_ROOT, stdio: "inherit" });
    record("build succeeded", true);
  } catch (e) {
    record("build succeeded", false, e instanceof Error ? e.message : String(e));
    return 1;
  }

  // 2. Spawn server
  process.stdout.write("[smoke] Spawning server…\n");
  const serverPath = path.join(REPO_ROOT, "dist", "index.js");
  const server = spawn("node", [serverPath], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let port: number | null = null;
  let ready = false;
  let appleScriptDisabled = false;
  let stderrBuf = "";

  server.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stderrBuf += text;
    process.stderr.write(`[server] ${text}`);
    if (port === null) {
      const match = text.match(/bridge at :(\d+)/);
      if (match) port = Number(match[1]);
    }
    if (!ready && /MCP server running on stdio/.test(text)) {
      ready = true;
    }
    if (/AppleScript disabled:/.test(text)) {
      appleScriptDisabled = true;
    }
  });

  const exited = new Promise<number>((resolve) => {
    server.on("exit", (code) => resolve(code ?? 0));
  });

  // Wait up to 30s for both port + ready
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && (!port || !ready)) {
    await sleep(200);
  }

  if (!port) {
    record("bridge port detected", false, "timed out waiting for bridge port");
    server.kill("SIGTERM");
    await exited;
    return 1;
  }
  record("bridge port detected", true, `:${port}`);

  if (!ready) {
    record("server ready", false, "did not see 'MCP server running on stdio'");
    server.kill("SIGTERM");
    await exited;
    return 1;
  }
  record("server ready", true);

  const base = `http://127.0.0.1:${port}`;

  // 3. Endpoint checks
  try {
    // GET /openapi
    const resp = await fetch(`${base}/openapi`);
    if (resp.status !== 200) {
      record("GET /openapi returns 200", false, `status=${resp.status}`);
    } else {
      record("GET /openapi returns 200", true);
      const body = (await resp.json()) as { paths?: Record<string, unknown> };
      const paths = body.paths ?? {};
      const pathCount = Object.keys(paths).length;
      if (typeof body.paths !== "object" || body.paths === null) {
        record("openapi has paths object", false);
      } else {
        record("openapi has paths object", true, `${pathCount} paths`);
      }

      // Backward-compat: v0.2.0 had 12+ CLI paths.
      if (pathCount >= 12) {
        record("openapi has >= 12 paths (v0.2.0 compat)", true, `${pathCount}`);
      } else {
        record("openapi has >= 12 paths (v0.2.0 compat)", false, `only ${pathCount}`);
      }

      // JXA paths: only assert when AppleScript enabled (Hookmark running + permission).
      const jxaPaths = [
        "/all_bookmarks",
        "/count_bookmarks",
      ];
      if (appleScriptDisabled) {
        console.warn(
          "[smoke] AppleScript disabled; skipping JXA-paths assertion"
        );
      } else {
        const hasJxa = jxaPaths.every((p) => p in paths);
        if (hasJxa) {
          // Confirm we have the full JXA surface (15 subcommands).
          const jxaLike = Object.keys(paths).filter(
            (p) => !p.startsWith("/openapi")
          );
          // Heuristic: CLI ~12 + JXA ~15 = 27 total. Accept >= 25.
          if (jxaLike.length >= 25) {
            record("JXA paths merged (>= 25 total)", true, `${jxaLike.length}`);
          } else {
            record(
              "JXA paths merged (>= 25 total)",
              false,
              `only ${jxaLike.length}`
            );
          }
        } else {
          record(
            "JXA paths merged",
            false,
            "missing /all_bookmarks or /count_bookmarks"
          );
        }
      }
    }

    // POST /list with {}
    const listResp = await fetch(`${base}/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (listResp.status !== 200) {
      record("POST /list {} returns 200", false, `status=${listResp.status}`);
    } else {
      record("POST /list {} returns 200", true);
      const body = (await listResp.json()) as { output?: unknown };
      if (typeof body.output === "string") {
        record("POST /list {} output is string (v0.2.0 compat)", true);
      } else {
        record(
          "POST /list {} output is string (v0.2.0 compat)",
          false,
          `typeof output=${typeof body.output}`
        );
      }
    }

    // POST /list with { json: true }
    const listJsonResp = await fetch(`${base}/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: true }),
    });
    if (listJsonResp.status !== 200) {
      record(
        "POST /list {json:true} returns 200",
        false,
        `status=${listJsonResp.status}`
      );
    } else {
      record("POST /list {json:true} returns 200", true);
      const body = (await listJsonResp.json()) as { output?: unknown };
      if (Array.isArray(body.output)) {
        record(
          "POST /list {json:true} output is array",
          true,
          `length=${body.output.length}`
        );
      } else {
        record(
          "POST /list {json:true} output is array",
          false,
          `typeof output=${typeof body.output}`
        );
      }
    }
  } catch (e) {
    record("endpoint checks", false, e instanceof Error ? e.message : String(e));
  }

  // 4. Shutdown
  process.stdout.write("[smoke] Shutting down server…\n");
  server.kill("SIGTERM");
  const shutdownDeadline = Date.now() + 10_000;
  const shutdownPromise = Promise.race([
    exited,
    (async () => {
      while (Date.now() < shutdownDeadline) {
        if (server.exitCode !== null) return server.exitCode;
        await sleep(100);
      }
      return -1;
    })(),
  ]);
  const code = await shutdownPromise;
  if (code === -1) {
    record("server exited after SIGTERM", false, "timed out; sending SIGKILL");
    server.kill("SIGKILL");
  } else {
    record("server exited after SIGTERM", true, `exit code=${code}`);
  }

  // Silence unused-buffer warnings
  void stderrBuf;

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(
    `\n[smoke] ${results.length - failed.length}/${results.length} checks passed\n`
  );
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[smoke] Fatal:", err);
    process.exit(1);
  });
