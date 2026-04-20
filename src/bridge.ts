import http from "node:http";
import type { HookCliSpec, HookSubcommand } from "./specTypes.js";
import { extractPositionals, generateOpenApiSpec } from "./manualBuilder.js";

export interface BridgeOptions {
  spec: HookCliSpec;
  hookCli: string;
  runHook: (hookCli: string, args: string[]) => string;
  getChangelogHtml: () => string;
}

export interface BridgeServer {
  listen: (port: number) => Promise<number>;
  close: () => Promise<void>;
}

function bodyToArgs(sub: HookSubcommand, body: Record<string, unknown>): string[] {
  const args: string[] = [sub.name];

  for (const opt of sub.options) {
    const key = (opt.long ?? opt.short ?? "").replace(/^-+/, "").replace(/-/g, "_");
    if (!key) continue;
    const value = body[key];
    if (value === true && opt.long) args.push(opt.long);
  }

  for (const p of extractPositionals(sub.usage)) {
    const v = body[p.name.toLowerCase()];
    if (typeof v === "string" && v.length > 0) args.push(v);
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
  const subByName = new Map(opts.spec.subcommands.map((s) => [s.name, s]));

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    res.setHeader("content-type", "application/json");

    if (req.method === "GET" && pathname === "/openapi") {
      const openapi = generateOpenApiSpec(`http://127.0.0.1:${(server.address() as { port: number }).port}`, opts.spec);
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
      try {
        const output = opts.runHook(opts.hookCli, bodyToArgs(sub, argsInput));
        res.end(JSON.stringify({ output }));
      } catch (e: unknown) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
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
