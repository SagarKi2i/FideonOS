#!/usr/bin/env node
// Fideon Runtime — headless background service.
//
// Runs the base runtime without the Electron GUI and autonomously executes
// workflows on their schedule (agent_pipelines.schedule_config). Authenticates
// once via the FastAPI backend (RS256/Argon2id) and stores the refresh token.
//
//   node service.js login --url <BACKEND_URL> --email <e> --password <p>
//   node service.js run                 # daemon: supervise runtime + scheduler
//   node service.js run-now <pipeline_id>
//   node service.js status

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { cronMatches, sameMinute } = require("./cron");
const { makeGraph } = require("./graph");

// __dirname = electron/runtime/  →  repo root is two levels up
const REPO_ROOT = path.join(__dirname, "..", "..");
const CONF_DIR = path.join(os.homedir(), ".fideon");
const CONFIG_PATH = path.join(CONF_DIR, "config.json");
const SESSION_PATH = path.join(CONF_DIR, "session.json");
const RUNTIME_PORT = parseInt(process.env.FIDEON_RUNTIME_PORT || "8766", 10);
const RUNTIME_URL = `http://127.0.0.1:${RUNTIME_PORT}`;
const POD_LOCAL_DIRS = {
  "document-retrieval": path.join(REPO_ROOT, "pods/document-retrieval-pod"),
  "placeholder-pod": path.join(REPO_ROOT, "pods/placeholder-pod"),
};

const log = (...a) => console.log(new Date().toISOString(), ...a);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
function writeJson(p, obj) {
  fs.mkdirSync(CONF_DIR, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  try { fs.chmodSync(p, 0o600); } catch { /* Windows doesn't support chmod */ }
}

function argFlag(name) { const i = process.argv.indexOf(`--${name}`); return i !== -1 ? process.argv[i + 1] : undefined; }

function promptPassword(label = "Password: ") {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(label);
    let buf = "";
    const onData = (ch) => {
      const s = ch.toString("utf8");
      if (s === "\n" || s === "\r" || s === "") {
        stdin.setRawMode && stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(buf);
      } else if (s === "") { // Ctrl-C
        process.stdout.write("\n"); process.exit(1);
      } else if (s === "" || s === "\b") { // backspace
        buf = buf.slice(0, -1);
      } else {
        buf += s;
      }
    };
    stdin.setRawMode && stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

// ── FastAPI JWT session ──────────────────────────────────────────────────────
let appConfig = null;
let accessToken = null;
let tokenExpiry = 0; // ms epoch

function makeHeaders() {
  return { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
}

async function refreshToken() {
  const sess = readJson(SESSION_PATH);
  if (!sess?.refresh_token) throw new Error("No saved session — run `service.js login` first.");
  const res = await fetch(`${appConfig.backendUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: sess.refresh_token }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} (re-run login)`);
  const data = await res.json();
  accessToken = data.access_token;
  // FastAPI tokens expire in 15 min by default; refresh 2 min early
  tokenExpiry = Date.now() + (data.expires_in ?? 900) * 1000 - 120000;
  if (data.refresh_token) writeJson(SESSION_PATH, { refresh_token: data.refresh_token });
  return accessToken;
}

async function getValidToken() {
  if (!accessToken || Date.now() >= tokenExpiry) await refreshToken();
  return accessToken;
}

async function bootstrapSession() {
  appConfig = readJson(CONFIG_PATH);
  if (!appConfig?.backendUrl) throw new Error("Not configured — run `service.js login` first.");
  await refreshToken();
}

// ── runtime supervision ──────────────────────────────────────────────────────
let runtimeProc = null;
function startRuntime() {
  const useElectronNode = !process.env.FIDEON_SYSTEM_NODE;
  const cmd = useElectronNode ? process.execPath : "node";
  const env = {
    ...process.env,
    RUNTIME_EXEC: "process",
    HEADLESS: "true",
    PORT: String(RUNTIME_PORT),
    POD_PORT_BASE: "9800",
    POD_LOCAL_DIRS: JSON.stringify(POD_LOCAL_DIRS),
  };
  if (useElectronNode) env.ELECTRON_RUN_AS_NODE = "1";
  runtimeProc = spawn(cmd, [path.join(__dirname, "server.js")], {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
  });
  runtimeProc.on("exit", (code) => {
    log(`[runtime] exited (${code}) — restarting in 2s`);
    setTimeout(startRuntime, 2000);
  });
}

async function waitRuntime(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${RUNTIME_URL}/health`); if (r.ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── pipeline execution (headless) ───────────────────────────────────────────
async function runPipeline(p) {
  const token = await getValidToken();
  const steps = Array.isArray(p.steps) ? p.steps : [];
  log(`▶ workflow "${p.name}" — ${steps.length} step(s)`);
  let carry = { workflow: p.name };
  for (let i = 0; i < steps.length; i++) {
    const slug = steps[i].agent_id;
    const toolName = slug.replace(/-/g, "_");
    if (!POD_LOCAL_DIRS[slug]) { log(`  ↷ ${slug} — no local build, skipped`); continue; }
    try {
      await fetch(`${RUNTIME_URL}/pods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, toolName, image: slug, config: steps[i].config ?? {} }),
      });
      const res = await fetch(`${RUNTIME_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: toolName, arguments: { config: steps[i].config ?? {}, context: carry, authToken: token } },
        }),
      });
      const body = await res.json();
      if (body.error) { log(`  ✗ ${slug}: ${body.error.message}`); break; }
      const output = body.result?.structuredContent ?? body.result ?? {};
      const confidence = Number(output.confidence ?? 0.9);
      // Persist pod run via backend API (FastAPI, not direct Supabase)
      await fetch(`${appConfig.backendUrl}/pods/runs`, {
        method: "POST",
        headers: makeHeaders(),
        body: JSON.stringify({ pod_slug: slug, input: steps[i].config ?? {}, output, status: confidence < 0.85 ? "needs_review" : "succeeded", confidence, source: "workflow", completed_at: new Date().toISOString() }),
      });
      log(`  ✓ ${slug} (conf ${confidence.toFixed(2)})${output.documentsFound != null ? ` — ${output.documentsFound} docs, ${output.attached} attached` : ""}`);
      carry = { ...carry, [`${slug}_output`]: output };
    } catch (e) { log(`  ✗ ${slug}: ${e.message}`); break; }
  }
  // Update last_run_at via backend
  await fetch(`${appConfig.backendUrl}/pipelines/${p.id}/ran`, {
    method: "POST", headers: makeHeaders(),
  }).catch(() => { /* best-effort */ });
  log(`━ "${p.name}" complete`);
}

// ── scheduler ──────────────────────────────────────────────────────────────
function isDue(p, now) {
  const sc = p.schedule_config;
  if (!p.is_active || !sc || !sc.enabled) return false;
  if (sc.type === "one_time" || sc.scheduled_at) {
    if (!sc.scheduled_at) return false;
    return now >= new Date(sc.scheduled_at) && (!p.last_run_at || new Date(p.last_run_at) < new Date(sc.scheduled_at));
  }
  if (!sc.cron_expression) return false;
  return cronMatches(sc.cron_expression, now) && !sameMinute(p.last_run_at, now);
}

// ── email polling (MS Graph) ────────────────────────────────────────────────
let emailSince = null;
let graphIdleLogged = false;
let graphEnv = process.env;

async function loadRemoteConfig() {
  try {
    const token = await getValidToken();
    const res = await fetch(`${appConfig.backendUrl}/runtime/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const cfg = await res.json();
    graphEnv = {
      ...process.env,
      MSGRAPH_TENANT_ID: cfg.graph?.tenant_id || process.env.MSGRAPH_TENANT_ID,
      MSGRAPH_CLIENT_ID: cfg.graph?.client_id || process.env.MSGRAPH_CLIENT_ID,
      MSGRAPH_CLIENT_SECRET: cfg.graph?.client_secret || process.env.MSGRAPH_CLIENT_SECRET,
    };
    log("[config] loaded runtime config from Settings");
  } catch (e) { log(`[config] runtime-config fetch failed (${e.message}) — using local env`); }
}

async function sendHeartbeat() {
  try {
    const token = await getValidToken();
    await fetch(`${appConfig.backendUrl}/runtime/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* offline; retried next tick */ }
}

async function pollEmail() {
  const graph = makeGraph(graphEnv);
  const mailbox = process.env.FIDEON_MS_MAILBOX;
  if (!graph.enabled || !mailbox) {
    if (!graphIdleLogged) {
      log(`[email] MS Graph ${graph.enabled ? "enabled but no FIDEON_MS_MAILBOX" : "not configured"} — email polling idle`);
      graphIdleLogged = true;
    }
    return;
  }
  try {
    const token = await getValidToken();
    const msgs = await graph.listInbox(mailbox, emailSince);
    if (!msgs.length) return;
    // Dedupe + insert via backend API
    let inserted = 0;
    for (const m of msgs) {
      const r = await fetch(`${appConfig.backendUrl}/email/ingest`, {
        method: "POST",
        headers: { ...makeHeaders(), Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          from_address: m.fromAddress, from_name: m.fromName, to_address: m.to,
          subject: m.subject, snippet: (m.snippet || m.bodyText || "").slice(0, 180),
          body_text: m.bodyText, body_html: m.bodyHtml, attachments: m.attachments || [],
          status: "unread", source: "graph", provider_message_id: m.id, received_at: m.receivedAt,
        }),
      });
      if (r.ok) {
        inserted++;
        if (!emailSince || new Date(m.receivedAt) > new Date(emailSince)) emailSince = m.receivedAt;
      }
    }
    if (inserted) log(`[email] ingested ${inserted} new message(s) from ${mailbox}`);
  } catch (e) { log(`[email] poll failed: ${e.message}`); }
}

async function tick() {
  try {
    await getValidToken(); // keep session warm
    const token = accessToken;
    const res = await fetch(`${appConfig.backendUrl}/pipelines?fields=id,name,steps,is_active,last_run_at,schedule_config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { log(`[scheduler] query error: ${res.status}`); return; }
    const data = await res.json();
    const now = new Date();
    const due = (data?.pipelines || data || []).filter((p) => isDue(p, now));
    if (due.length) log(`[scheduler] ${due.length} workflow(s) due`);
    for (const p of due) await runPipeline(p);
  } catch (e) { log(`[scheduler] tick failed: ${e.message}`); }
}

// ── commands ──────────────────────────────────────────────────────────────
async function cmdLogin() {
  const url = argFlag("url"), email = argFlag("email");
  let password = argFlag("password");
  if (!url || !email) { console.error("Usage: service.js login --url <BACKEND_URL> --email <e> [--password <p>]"); process.exit(1); }
  if (!password) password = await promptPassword(`Password for ${email}: `);
  if (!password) { console.error("Password required."); process.exit(1); }
  const res = await fetch(`${url}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) { console.error(`Login failed: ${res.status} ${await res.text()}`); process.exit(1); }
  const data = await res.json();
  if (!data.access_token) { console.error("Login failed: no access_token returned"); process.exit(1); }
  writeJson(CONFIG_PATH, { backendUrl: url });
  writeJson(SESSION_PATH, { refresh_token: data.refresh_token });
  log(`Logged in. Config saved to ${CONF_DIR}.`);
}

async function cmdRun() {
  await bootstrapSession();
  log(`Fideon Runtime service starting (runtime on :${RUNTIME_PORT})`);
  startRuntime();
  if (!(await waitRuntime())) { log("runtime failed to start"); process.exit(1); }
  log("runtime online — scheduler active (60s tick)");

  await sendHeartbeat();
  setInterval(sendHeartbeat, 60000);

  await loadRemoteConfig();

  await pollEmail();
  setInterval(pollEmail, 120000);

  await tick();
  setInterval(tick, 60000);
}

async function cmdRunNow(pipelineId) {
  if (!pipelineId) { console.error("Usage: service.js run-now <pipeline_id>"); process.exit(1); }
  await bootstrapSession();
  startRuntime();
  if (!(await waitRuntime())) { log("runtime failed to start"); process.exit(1); }
  const token = await getValidToken();
  const res = await fetch(`${appConfig.backendUrl}/pipelines/${pipelineId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { log(`pipeline not found: ${pipelineId}`); process.exit(1); }
  const p = await res.json();
  await runPipeline(p);
  if (runtimeProc) { runtimeProc.removeAllListeners("exit"); runtimeProc.kill(); }
  process.exit(0);
}

async function cmdStatus() {
  let health = null;
  try { health = await (await fetch(`${RUNTIME_URL}/health`)).json(); } catch { /* offline */ }
  log(`runtime: ${health ? `online (${(health.pods || []).length} pods)` : "offline"}`);
  try {
    await bootstrapSession();
    const token = await getValidToken();
    const res = await fetch(`${appConfig.backendUrl}/pipelines?fields=name,is_active,schedule_config,last_run_at`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    for (const p of data?.pipelines || data || []) {
      const sc = p.schedule_config;
      log(`  • ${p.name}: ${p.is_active ? "active" : "paused"} · ${sc?.enabled ? (sc.cron_expression || sc.type) : "no schedule"} · last ${p.last_run_at || "—"}`);
    }
  } catch (e) { log(`(not logged in: ${e.message})`); }
  process.exit(0);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === "login") return cmdLogin();
  if (cmd === "run") return cmdRun();
  if (cmd === "run-now") return cmdRunNow(process.argv[3]);
  if (cmd === "status") return cmdStatus();
  console.error("Commands: login | run | run-now <pipeline_id> | status");
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
