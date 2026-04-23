import { execSync } from "node:child_process";

export function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function buildHookCommand(hookCli: string, args: string[]): string {
  return [hookCli, ...args].map(shellEscape).join(" ");
}

export function extractHookUrl(text: string): string | null {
  const match = text.match(/hook:\/\/[^\s'"]+/);
  return match ? match[0] : null;
}

export interface RunHookOptions {
  stdin?: string;
  timeoutMs?: number;
}

export function runHook(
  hookCli: string,
  args: string[],
  opts: RunHookOptions = {}
): string {
  const cmd = buildHookCommand(hookCli, args);
  try {
    const output = execSync(cmd, {
      encoding: "utf-8",
      stdio:
        opts.stdin !== undefined
          ? ["pipe", "pipe", "pipe"]
          : ["ignore", "pipe", "pipe"],
      timeout: opts.timeoutMs ?? 30_000,
      input: opts.stdin,
    });
    return output.trim();
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stderr" in err) {
      const e = err as { stderr: string; stdout: string; message: string };
      const detail = (e.stderr || e.message || "").trim();
      throw new Error(detail || `hook ${args[0]} failed`);
    }
    throw err;
  }
}
