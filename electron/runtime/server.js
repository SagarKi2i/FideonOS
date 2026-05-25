// Fideon base runtime — one per tenant, long-lived on a VM / desktop.
//
// Lightweight local orchestrator: the platform SYNCS pods to it (control API),
// and it runs each pod as its own container, then exposes a SINGLE MCP endpoint
// that multiplexes every synced pod (routing tools/call to the right pod container).
//
//   Control API (Bearer CONTROL_TOKEN):
//     GET    /health          → { ok, pods:[…] }
//     POST   /pods            → sync: { slug, toolName, image, config }  (pull + run)
//     DELETE /pods/:slug      → unsync: stop + remove the pod container
//     GET    /pods            → list synced pods
//   MCP endpoint (Bearer CONTROL_TOKEN):
//     POST   /mcp             → initialize / tools/list (aggregated) / tools/call (routed)
//
// Pod execution backend:
//   RUNTIME_EXEC=docker (default) → `docker run` each pod image as a sibling container.
//   RUNTIME_EXEC=process          → spawn `node <dir>/server.js` from POD_LOCAL_DIRS
//                                    (dev only — run pods from local source, no Docker).

const http = require("http");
const net = require("net");
const { execFile, spawn } = require("child_process");

// Find a free TCP port starting at `start`.
function findFreePort(start) {
  return new Promise((resolve) => {
    const tryPort = (p) => {
      const s = net.createServer();
      s.once("error", () => tryPort(p + 1));
      s.once("listening", () => s.close(() => resolve(p)));
      s.listen(p);
    };
    tryPort(start);
  });
}

const PORT = parseInt(process.env.PORT || "8080", 10);
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || "";
const POD_HOST = process.env.POD_HOST || "127.0.0.1";
const PORT_BASE = parseInt(process.env.POD_PORT_BASE || "9000", 10);
const EXEC = process.env.RUNTIME_EXEC || "docker";
const POD_LOCAL_DIRS = (() => {
  try { return JSON.parse(process.env.POD_LOCAL_DIRS || "{}"); } catch { return {}; }
})();

// slug → { toolName, image, hostPort, config, tools[], proc? }
const pods = new Map();
let portCursor = PORT_BASE;

const sh = (cmd, args) => new Promise((resolve, reject) =>
  execFile(cmd, args, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) =>
    err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim())));

async function waitHealthy(port, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://${POD_HOST}:${port}/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function podMcp(port, method, params) {
  const r = await fetch(`http://${POD_HOST}:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const b = await r.json();
  if (b.error) throw new Error(b.error.message);
  return b.result;
}

// ── pod lifecycle ─────────────────────────────────────────────────────────
async function startPod(slug, spec, port) {
  const cfgB64 = Buffer.from(JSON.stringify(spec.config || {})).toString("base64");
  if (EXEC === "process") {
    const dir = POD_LOCAL_DIRS[slug] || POD_LOCAL_DIRS[spec.image];
    if (!dir) throw new Error(`No POD_LOCAL_DIRS entry for ${slug}`);
    const proc = spawn(process.execPath, ["server.js"], {
      cwd: dir,
      env: {
        ...process.env,
        PORT: String(port),
        MOCK_PORT: String(port + 500),
        POD_SLUG: slug,
        MCP_TOOL_NAME: spec.toolName,
        POD_CONFIG: cfgB64,
      },
      stdio: process.env.POD_DEBUG ? "inherit" : "ignore",
    });
    return { proc };
  }
  // docker mode: remove stale container, run fresh
  await sh("docker", ["rm", "-f", `pod-${slug}`]).catch(() => {});
  await sh("docker", [
    "run", "-d", "--restart", "always", "--name", `pod-${slug}`,
    "-p", `${port}:8080`,
    "-e", `POD_SLUG=${slug}`,
    "-e", `MCP_TOOL_NAME=${spec.toolName}`,
    "-e", `POD_CONFIG=${cfgB64}`,
    spec.image,
  ]);
  return {};
}

async function stopPod(slug) {
  const p = pods.get(slug);
  if (!p) return;
  if (p.proc) p.proc.kill("SIGTERM");
  else await sh("docker", ["rm", "-f", `pod-${slug}`]).catch(() => {});
  pods.delete(slug);
}

async function syncPod(spec) {
  const { slug } = spec;
  if (pods.has(slug)) await stopPod(slug);
  const port = await findFreePort(portCursor);
  portCursor = port + 1;
  const handle = await startPod(slug, spec, port);
  const ok = await waitHealthy(port);
  if (!ok) { await stopPod(slug); throw new Error(`pod ${slug} failed health check`); }
  let tools = [];
  try { tools = (await podMcp(port, "tools/list", {})).tools ?? []; } catch { /* tolerate */ }
  pods.set(slug, { ...spec, hostPort: port, tools, proc: handle.proc });
  return { slug, port, tools: tools.map((t) => t.name) };
}

function findPodByTool(toolName) {
  for (const [slug, p] of pods) {
    if (p.toolName === toolName || (p.tools || []).some((t) => t.name === toolName)) return { slug, ...p };
  }
  return null;
}

// ── MCP multiplexer ─────────────────────────────────────────────────────────
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleMcp(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fideon-base-runtime", version: "1.0.0" },
      });
    case "tools/list": {
      const all = [];
      for (const [, p] of pods) all.push(...(p.tools || []));
      return rpcResult(id, { tools: all });
    }
    case "tools/call": {
      const pod = findPodByTool(params?.name);
      if (!pod) return rpcError(id, -32602, `No installed pod exposes tool: ${params?.name}`);
      try {
        const result = await podMcp(pod.hostPort, "tools/call", params);
        return rpcResult(id, result);
      } catch (e) {
        return rpcError(id, -32000, `Pod call failed: ${e.message}`);
      }
    }
    case "ping": return rpcResult(id, {});
    default: return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ── HTTP server (control API + MCP) ──────────────────────────────────────────
function authed(req) {
  if (!CONTROL_TOKEN) return true;
  return (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim() === CONTROL_TOKEN;
}

const send = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};

const readBody = (req) => new Promise((resolve) => {
  let r = "";
  req.on("data", (c) => (r += c));
  req.on("end", () => resolve(r));
});

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (req.method === "GET" && url === "/health") {
    return send(res, 200, { ok: true, pods: [...pods.keys()] });
  }
  if (!authed(req)) return send(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET" && url === "/pods") {
      return send(res, 200, {
        pods: [...pods.values()].map((p) => ({ slug: p.slug, toolName: p.toolName, port: p.hostPort })),
      });
    }
    if (req.method === "POST" && url === "/pods") {
      const spec = JSON.parse(await readBody(req));
      if (!spec.slug || !spec.image) return send(res, 400, { error: "slug and image required" });
      const out = await syncPod(spec);
      return send(res, 200, { ok: true, ...out });
    }
    if (req.method === "DELETE" && url.startsWith("/pods/")) {
      await stopPod(decodeURIComponent(url.replace("/pods/", "")));
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && (url === "/mcp" || url === "/")) {
      let msg;
      try { msg = JSON.parse(await readBody(req)); } catch (e) {
        return send(res, 200, rpcError(null, -32700, e.message));
      }
      return send(res, 200, await handleMcp(msg));
    }
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, () =>
  console.log(`[fideon-runtime] control+MCP on :${PORT} (exec=${EXEC})`));
