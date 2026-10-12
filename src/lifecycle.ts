/**
 * Process lifecycle for the stdio MCP server.
 *
 * The local HTTP bridge keeps Node's event loop alive, so without these
 * hooks the server outlives its client: a closed stdin pipe leaves the
 * process running forever. Every trigger funnels into one idempotent
 * shutdown that runs cleanup (bounded by a timeout) and then exits.
 */

export type ShutdownReason =
  | "stdin-end"
  | "stdin-close"
  | "SIGTERM"
  | "SIGINT"
  | "SIGHUP"
  | "parent-exit";

interface Once {
  once(event: string, listener: () => void): unknown;
}

export interface LifecycleDeps {
  stdin: Once;
  signals: Once;
  getPpid: () => number;
  cleanup: () => Promise<void>;
  exit: (code: number) => void;
  log?: (message: string) => void;
  parentPollMs?: number;
  cleanupTimeoutMs?: number;
}

export interface Lifecycle {
  shutdown: (reason: ShutdownReason) => Promise<void>;
}

const SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"] as const;

export function installShutdownHooks(deps: LifecycleDeps): Lifecycle {
  const initialPpid = deps.getPpid();
  const cleanupTimeoutMs = deps.cleanupTimeoutMs ?? 2000;
  let pending: Promise<void> | null = null;

  // A changed ppid means the client died without closing our stdin (e.g.
  // SIGKILL) and we were reparented. Compare against the initial value, not
  // 1, so a server launched directly by launchd is not treated as orphaned.
  const parentWatch = setInterval(() => {
    if (deps.getPpid() !== initialPpid) void shutdown("parent-exit");
  }, deps.parentPollMs ?? 2000);
  parentWatch.unref?.();

  function shutdown(reason: ShutdownReason): Promise<void> {
    if (pending) return pending;
    clearInterval(parentWatch);
    deps.log?.(`[hook] Shutting down (${reason})`);
    pending = withTimeout(Promise.resolve().then(deps.cleanup), cleanupTimeoutMs)
      .catch((err: unknown) => {
        deps.log?.(`[hook] Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => deps.exit(0));
    return pending;
  }

  deps.stdin.once("end", () => void shutdown("stdin-end"));
  deps.stdin.once("close", () => void shutdown("stdin-close"));
  for (const signal of SIGNALS) {
    deps.signals.once(signal, () => void shutdown(signal));
  }

  return { shutdown };
}

function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`cleanup timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
