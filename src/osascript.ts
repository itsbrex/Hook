import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function defaultExec(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(cmd, args, {
    encoding: "utf-8",
    timeout: 10_000,
  });
  return {
    stdout: (result.stdout as string) ?? "",
    stderr: (result.stderr as string) ?? "",
  };
}

export function shellEscapeArg(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export class OsascriptError extends Error {
  public readonly stderr: string;
  public readonly stdout: string;
  public readonly code: number | null;
  public readonly hint?: string;

  constructor(
    message: string,
    stderr: string,
    stdout: string,
    code: number | null
  ) {
    super(message);
    this.name = "OsascriptError";
    this.stderr = stderr;
    this.stdout = stdout;
    this.code = code;
    if (/-1743|Not authorized to send Apple events/i.test(stderr + message)) {
      this.hint =
        "macOS Automation permission required. Open System Settings > Privacy & Security > Automation and allow the process running this MCP server (Claude Code / Node) to control Hookmark.";
    }
  }
}

export interface RunOsascriptOptions {
  args?: string[];
  timeoutMs?: number;
  language?: "applescript" | "javascript";
}

export type ProbeResult =
  | { ok: true }
  | {
      ok: false;
      reason: "permission" | "not_running" | "unknown";
      detail?: string;
    };

export interface ProbeOptions {
  exec?: (
    cmd: string,
    args: string[]
  ) => Promise<{ stdout: string; stderr: string }>;
}

export async function probeHookmark(
  opts: ProbeOptions = {}
): Promise<ProbeResult> {
  const exec = opts.exec ?? defaultExec;
  try {
    await exec("osascript", [
      "-e",
      'tell application "Hookmark" to count bookmarks',
    ]);
    return { ok: true };
  } catch (err: unknown) {
    const stderr =
      (err as { stderr?: string }).stderr ??
      (err instanceof Error ? err.message : String(err));
    if (stderr.includes("-1743") || /not authorized/i.test(stderr)) {
      return { ok: false, reason: "permission", detail: stderr.trim() };
    }
    if (stderr.includes("-600") || /isn.?t running/i.test(stderr)) {
      return { ok: false, reason: "not_running", detail: stderr.trim() };
    }
    return { ok: false, reason: "unknown", detail: stderr.trim() };
  }
}

export function runOsascript(
  script: string,
  opts: RunOsascriptOptions = {}
): string {
  const language = opts.language ?? "applescript";
  const argv: string[] =
    language === "javascript"
      ? ["-l", "JavaScript", "-e", script]
      : ["-ss", "-e", script];
  if (opts.args && opts.args.length > 0) {
    argv.push("--");
    for (const a of opts.args) argv.push(a);
  }
  try {
    return execFileSync("/usr/bin/osascript", argv, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: opts.timeoutMs ?? 60_000,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object") {
      const e = err as {
        stderr?: Buffer | string;
        stdout?: Buffer | string;
        status?: number | null;
        message?: string;
      };
      const stderr =
        typeof e.stderr === "string"
          ? e.stderr
          : e.stderr?.toString("utf-8") ?? "";
      const stdout =
        typeof e.stdout === "string"
          ? e.stdout
          : e.stdout?.toString("utf-8") ?? "";
      const msg = (stderr || e.message || "osascript failed").trim();
      throw new OsascriptError(msg, stderr, stdout, e.status ?? null);
    }
    throw err;
  }
}
