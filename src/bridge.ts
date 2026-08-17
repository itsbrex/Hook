import http from "node:http";
import type { HookCliSpec, HookSubcommand } from "./specTypes.js";
import { extractPositionals, generateOpenApiSpec } from "./manualBuilder.js";
import { parseVerboseListing, parseVerboseFindListing } from "./verboseParser.js";

export interface BridgeOptions {
  spec: HookCliSpec;
  hookCli: string;
  defaultTimeoutMs?: number;
  runHook: (
    hookCli: string,
    args: string[],
    opts?: { stdin?: string; timeoutMs?: number }
  ) => string;
  /**
   * Dispatcher for `source: "osascript"` routes. Takes a JXA script
   * (osascript -l JavaScript) and positional args, returns raw stdout
   * (typically a JSON-encoded string from `JSON.stringify(...)`).
   * Throws `OsascriptError` on osascript failure.
   */
  runOsascript?: (
    script: string,
    args: string[],
    opts?: { timeoutMs?: number }
  ) => string;
  getChangelogHtml: () => string;
}

export interface BridgeServer {
  listen: (port: number) => Promise<number>;
  close: () => Promise<void>;
}

function bodyToArgs(sub: HookSubcommand, body: Record<string, unknown>): string[] {
  const args: string[] = sub.cliArgs ? [...sub.cliArgs] : [sub.name];

  for (const opt of sub.options) {
    const key = (opt.long ?? opt.short ?? "").replace(/^-+/, "").replace(/-/g, "_");
    if (!key || !opt.long) continue;
    const value = body[key];
    if (opt.valueArg) {
      if (typeof value === "string" && value.length > 0) {
        args.push(`${opt.long}=${value}`);
      }
    } else if (value === true) {
      args.push(opt.long);
    }
  }

  for (const p of extractPositionals(sub.usage)) {
    const v = body[p.name.toLowerCase()];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.length > 0) args.push(item);
      }
    } else if (typeof v === "string" && v.length > 0) {
      args.push(v);
    }
  }

  return args;
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function createBridgeServer(opts: BridgeOptions): BridgeServer {
  const subByName = new Map<string, HookSubcommand>();
  for (const sub of opts.spec.subcommands) {
    subByName.set(sub.name, sub);
    for (const alias of sub.aliases ?? []) subByName.set(alias, sub);
  }

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    res.setHeader("content-type", "application/json");

    if (req.method === "GET" && pathname === "/openapi") {
      const openapi = generateOpenApiSpec(
        `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        opts.spec,
        opts.defaultTimeoutMs
      );
      res.end(JSON.stringify(openapi));
      return;
    }

    if (req.method === "GET" && pathname === "/changelog") {
      res.setHeader("content-type", "text/html");
      res.end(opts.getChangelogHtml());
      return;
    }

    if (req.method === "POST") {
      const name = pathname.slice(1);
      const sub = subByName.get(name);
      if (!sub) { res.statusCode = 404; res.end(JSON.stringify({ error: `Unknown operation: ${name}` })); return; }
      const body = await readJsonBody(req);
      const query = Object.fromEntries(requestUrl.searchParams.entries());
      const argsInput = { ...query, ...body };

      const timeoutMs =
        typeof argsInput.timeoutMs === "number" && argsInput.timeoutMs > 0
          ? argsInput.timeoutMs
          : opts.defaultTimeoutMs;

      if (sub.source === "osascript") {
        if (!opts.runOsascript) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: `osascript executor not wired for '${sub.name}'`,
            })
          );
          return;
        }
        try {
          const positionals = extractPositionals(sub.usage);
          const argsList: string[] = [];
          for (const p of positionals) {
            const v = argsInput[p.name.toLowerCase()];
            if (Array.isArray(v)) {
              for (const item of v)
                if (typeof item === "string") argsList.push(item);
            } else if (typeof v === "string") {
              argsList.push(v);
            }
          }
          const output =
            timeoutMs !== undefined
              ? opts.runOsascript(
                  sub.appleScriptSource ?? "",
                  argsList,
                  { timeoutMs }
                )
              : opts.runOsascript(sub.appleScriptSource ?? "", argsList);
          res.end(JSON.stringify({ output }));
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          const hint = (e as { hint?: string })?.hint;
          const isAuthError = /-1743|Not authorized to send Apple events/i.test(
            message
          );
          const payload: Record<string, string> = { error: message };
          if (hint) payload.hint = hint;
          else if (isAuthError) {
            payload.hint =
              "macOS Automation permission required. Open System Settings > Privacy & Security > Automation and allow the process running this MCP server (Claude Code / Node) to control Hookmark.";
          }
          res.statusCode = 500;
          res.end(JSON.stringify(payload));
        }
        return;
      }

      const wantsJson = argsInput.json === true || argsInput.json === "true";
      const jsonEligible = sub.name === "list" || sub.name === "find";
      const argsInputForCli: Record<string, unknown> = { ...argsInput };
      delete argsInputForCli.json;
      delete argsInputForCli.timeoutMs;
      if (wantsJson && jsonEligible) {
        // Force verbose format so parseVerboseListing has something to parse
        argsInputForCli.output_format = "verbose";
      }

      if (sub.name === "find") {
        const q = argsInputForCli.search_string;
        if (typeof q !== "string" || q.trim().length === 0) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error:
                "find requires a non-empty search_string (hook find with no query hangs on stdin)",
            })
          );
          return;
        }
      }

      const useStdin =
        sub.name === "percent_encode" || sub.name === "percent_decode";

      try {
        let rawOut: string;
        if (useStdin) {
          // The Hookmark CLI's positional-arg form for `hook percent encode|decode`
          // exits 0 but writes nothing to stdout. The stdin-pipe form
          // (`hook percent encode -`) works. Route these two subs via stdin.
          const stdinInput =
            typeof argsInputForCli.string === "string"
              ? argsInputForCli.string
              : "";
          const cliArgs = sub.cliArgs
            ? [...sub.cliArgs, "-"]
            : [sub.name, "-"];
          rawOut = opts.runHook(opts.hookCli, cliArgs, {
            stdin: stdinInput,
            ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          });
        } else {
          const cliArgs = bodyToArgs(sub, argsInputForCli);
          rawOut =
            timeoutMs !== undefined
              ? opts.runHook(opts.hookCli, cliArgs, { timeoutMs })
              : opts.runHook(opts.hookCli, cliArgs);
        }
        let output: unknown = rawOut;
        if (wantsJson && jsonEligible) {
          output = sub.name === "find"
            ? parseVerboseFindListing(rawOut)
            : parseVerboseListing(rawOut);
        }
        res.end(JSON.stringify({ output }));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const isAuthError = /-1743|Not authorized to send Apple events/i.test(message);
        const payload: Record<string, string> = { error: message };
        if (isAuthError) {
          payload.hint =
            "macOS Automation permission required. Open System Settings > Privacy & Security > Automation and allow the process running this MCP server (Claude Code / Node) to control Hookmark.";
        }
        res.statusCode = 500;
        res.end(JSON.stringify(payload));
      }
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return {
    listen: (port) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve((server.address() as { port: number }).port))),
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
