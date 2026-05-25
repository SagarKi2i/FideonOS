const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile, exec, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

// ── Embedded Next.js server (production only) ─────────────────────────────────
// In dev we rely on `next dev` running separately.
// In prod the Next.js standalone bundle is packaged inside the app and we
// spawn it here so QA / end-users need no separate server.
const NEXT_PORT = 3000;
let nextProc = null;

function getResourcesPath() {
  // In a packaged app, process.resourcesPath points to the resources folder.
  // In dev (electron electron/main.cjs) it isn't set, so we fall back to repo root.
  return process.resourcesPath || path.join(__dirname, '..');
}

function startNextServer() {
  if (isDev) return; // dev uses `next dev` separately
  const resourcesPath = getResourcesPath();
  // electron-builder copies frontend/.next/standalone/** into resources root
  const serverScript = path.join(resourcesPath, 'frontend', '.next', 'standalone', 'server.js');
  if (!fs.existsSync(serverScript)) {
    console.error('[next-server] standalone server.js not found at', serverScript);
    return;
  }
  const env = {
    ...process.env,
    PORT: String(NEXT_PORT),
    NODE_ENV: 'production',
    // Static files and public assets are in resources alongside standalone
    NEXT_PUBLIC_STATIC_PATH: path.join(resourcesPath, 'frontend', '.next', 'static'),
  };
  nextProc = spawn(process.execPath, [serverScript], {
    cwd: path.dirname(serverScript),
    env,
    stdio: 'inherit',
  });
  nextProc.on('error', (err) => console.error('[next-server] error:', err));
  nextProc.on('exit', (code) => console.log(`[next-server] exited (${code})`));
}

function waitForPort(port, tries = 40) {
  return new Promise((resolve) => {
    const attempt = (n) => {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => { sock.destroy(); if (n > 0) setTimeout(() => attempt(n - 1), 500); else resolve(false); });
      sock.on('timeout', () => { sock.destroy(); if (n > 0) setTimeout(() => attempt(n - 1), 500); else resolve(false); });
      sock.connect(port, '127.0.0.1');
    };
    attempt(tries);
  });
}

// ── Embedded pod runtime ──────────────────────────────────────────────────────
// __dirname = electron/  →  runtime scripts live in electron/runtime/
const ELECTRON_DIR = __dirname;
const REPO_ROOT = path.join(ELECTRON_DIR, '..');
const RUNTIME_DIR = path.join(ELECTRON_DIR, 'runtime');
const RUNTIME_PORT = parseInt(process.env.FIDEON_RUNTIME_PORT || '8765', 10);
const RUNTIME_URL = `http://127.0.0.1:${RUNTIME_PORT}`;
let runtimeProc = null;
let runtimeError = null;

// Map pod slug → local source dir (process-exec mode, no Docker needed on desktop).
const POD_LOCAL_DIRS = {
  'document-retrieval': path.join(REPO_ROOT, 'pods/document-retrieval-pod'),
  'placeholder-pod':    path.join(REPO_ROOT, 'pods/placeholder-pod'),
};

function startRuntime() {
  runtimeError = null;
  // Prefer system `node`; fall back to Electron's own bundled Node so this
  // works even when `node` isn't on PATH (ELECTRON_RUN_AS_NODE flag).
  const useElectronNode = !process.env.FIDEON_SYSTEM_NODE;
  const cmd = useElectronNode ? process.execPath : 'node';
  const env = {
    ...process.env,
    RUNTIME_EXEC: 'process',
    HEADLESS: 'false',
    SLOWMO: process.env.SLOWMO || '700',
    PORT: String(RUNTIME_PORT),
    POD_PORT_BASE: '9300',
    POD_LOCAL_DIRS: JSON.stringify(POD_LOCAL_DIRS),
  };
  if (useElectronNode) env.ELECTRON_RUN_AS_NODE = '1';
  runtimeProc = spawn(cmd, [path.join(RUNTIME_DIR, 'server.js')], {
    cwd: REPO_ROOT, env, stdio: 'inherit',
  });
  runtimeProc.on('error', (err) => { runtimeError = err.message; console.error('[fideon-runtime] spawn error:', err); });
  runtimeProc.on('exit', (code) => { if (code) runtimeError = `runtime exited (${code})`; console.log(`[fideon-runtime] exited (${code})`); });
}

async function runtimeFetch(pathSeg, opts) {
  const res = await fetch(`${RUNTIME_URL}${pathSeg}`, opts);
  return res.json();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadURL(`http://localhost:${NEXT_PORT}/runtime-shell`);

  // DevTools is opt-in (set FIDEON_DEVTOOLS=1) instead of auto-opening every launch.
  if (process.env.FIDEON_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', async () => {
  startNextServer();
  startRuntime();
  if (!isDev) {
    // Show a loading window while Next.js boots
    mainWindow = new BrowserWindow({ width: 400, height: 200, frame: false, resizable: false, webPreferences: { contextIsolation: true } });
    mainWindow.loadURL('data:text/html,<body style="background:#0b0d14;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p style="color:#fff;font-family:sans-serif;font-size:14px">Starting Fideon OS…</p></body>');
    await waitForPort(NEXT_PORT);
    mainWindow.close();
    mainWindow = null;
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (runtimeProc) runtimeProc.kill();
  if (nextProc) nextProc.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (runtimeProc) runtimeProc.kill();
  if (nextProc) nextProc.kill();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ── Ollama IPC handlers (unchanged) ──────────────────────────────────────────

ipcMain.handle('ollama:check-status', async () => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (response.ok) return { installed: true, running: true };
    return { installed: true, running: false };
  } catch {
    return { installed: false, running: false };
  }
});

ipcMain.handle('ollama:list-models', async () => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    const data = await response.json();
    return { success: true, models: data.models || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ollama:pull-model', async (event, modelName) => {
  try {
    const response = await fetch('http://localhost:11434/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line);
          event.sender.send('ollama:pull-progress', {
            modelName,
            status: data.status,
            completed: data.completed,
            total: data.total,
          });
        } catch {}
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ollama:generate', async (event, { model, prompt, system }) => {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, system, stream: true }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullResponse += data.response;
            event.sender.send('ollama:generate-chunk', { chunk: data.response, done: data.done });
          }
        } catch {}
      }
    }
    return { success: true, response: fullResponse };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ollama:delete-model', async (event, modelName) => {
  try {
    const response = await fetch('http://localhost:11434/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });
    return { success: response.ok };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('is-electron', () => true);

// ── System service IPC (FNF-425 / 426 / 427 / 428) ───────────────────────────
// Allows the Settings → Device Setup page to install / uninstall / check the
// FastAPI backend as a native OS service with crash-recovery and auto-start.

const SERVICE_DIR = path.join(__dirname, 'service');

function runCommand(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, output: stderr || err.message });
      else resolve({ ok: true, output: stdout.trim() });
    });
  });
}

ipcMain.handle('service:install', async () => {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      const winswExe = path.join(SERVICE_DIR, 'windows', 'fideon-backend.exe');
      if (!fs.existsSync(winswExe)) {
        return { ok: false, output: 'fideon-backend.exe not found. Run scripts/install-winsw.ps1 in electron/service/windows/.' };
      }
      await runCommand(winswExe, ['stop']);
      await runCommand(winswExe, ['uninstall']);
      await runCommand(winswExe, ['install']);
      return runCommand(winswExe, ['start']);
    }

    if (platform === 'darwin') {
      const plist = path.join(SERVICE_DIR, 'macos', 'com.fideon.backend.plist');
      const dest = path.join(app.getPath('home'), 'Library', 'LaunchAgents', 'com.fideon.backend.plist');
      fs.copyFileSync(plist, dest);
      return runCommand('launchctl', [
        'bootstrap',
        `gui/${process.getuid()}`,
        dest,
      ]);
    }

    if (platform === 'linux') {
      const svcFile = path.join(SERVICE_DIR, 'linux', 'fideon-backend.service');
      const dest = path.join(app.getPath('home'), '.config', 'systemd', 'user', 'fideon-backend.service');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(svcFile, dest);
      await runCommand('systemctl', ['--user', 'daemon-reload']);
      await runCommand('systemctl', ['--user', 'enable', 'fideon-backend']);
      return runCommand('systemctl', ['--user', 'start', 'fideon-backend']);
    }

    return { ok: false, output: `Unsupported platform: ${platform}` };
  } catch (err) {
    return { ok: false, output: err.message };
  }
});

ipcMain.handle('service:uninstall', async () => {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      const winswExe = path.join(SERVICE_DIR, 'windows', 'fideon-backend.exe');
      await runCommand(winswExe, ['stop']);
      return runCommand(winswExe, ['uninstall']);
    }

    if (platform === 'darwin') {
      const dest = path.join(app.getPath('home'), 'Library', 'LaunchAgents', 'com.fideon.backend.plist');
      const result = await runCommand('launchctl', [
        'bootout',
        `gui/${process.getuid()}`,
        dest,
      ]);
      try { fs.unlinkSync(dest); } catch {}
      return result;
    }

    if (platform === 'linux') {
      await runCommand('systemctl', ['--user', 'stop', 'fideon-backend']);
      await runCommand('systemctl', ['--user', 'disable', 'fideon-backend']);
      const dest = path.join(app.getPath('home'), '.config', 'systemd', 'user', 'fideon-backend.service');
      try { fs.unlinkSync(dest); } catch {}
      return runCommand('systemctl', ['--user', 'daemon-reload']);
    }

    return { ok: false, output: `Unsupported platform: ${platform}` };
  } catch (err) {
    return { ok: false, output: err.message };
  }
});

ipcMain.handle('service:status', async () => {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      const winswExe = path.join(SERVICE_DIR, 'windows', 'fideon-backend.exe');
      if (!fs.existsSync(winswExe)) return { installed: false, running: false, output: 'fideon-backend.exe not found' };
      const result = await runCommand(winswExe, ['status']);
      const running = result.output.toLowerCase().includes('started');
      return { installed: result.ok, running, output: result.output };
    }

    if (platform === 'darwin') {
      const result = await runCommand('launchctl', [
        'print',
        `gui/${process.getuid()}/com.fideon.backend`,
      ]);
      const running = result.ok && result.output.includes('pid');
      return { installed: result.ok, running, output: result.output };
    }

    if (platform === 'linux') {
      const result = await runCommand('systemctl', ['--user', 'is-active', 'fideon-backend']);
      const running = result.output.trim() === 'active';
      const enabled = await runCommand('systemctl', ['--user', 'is-enabled', 'fideon-backend']);
      return { installed: enabled.output.trim() === 'enabled', running, output: result.output };
    }

    return { installed: false, running: false, output: `Unsupported platform: ${platform}` };
  } catch (err) {
    return { installed: false, running: false, output: err.message };
  }
});

ipcMain.handle('network:check-status', async () => {
  try {
    const response = await fetch('https://www.google.com', { method: 'HEAD' });
    return { online: response.ok };
  } catch {
    return { online: false };
  }
});

// ── Pod runtime IPC ───────────────────────────────────────────────────────────
ipcMain.handle('runtime:status', async () => {
  try { return { ok: true, ...(await runtimeFetch('/health')) }; }
  catch (e) {
    // Self-heal: restart the runtime process if it died.
    if (!runtimeProc || runtimeProc.exitCode !== null || runtimeProc.killed) startRuntime();
    return { ok: false, error: runtimeError || e.message };
  }
});

ipcMain.handle('runtime:canRun', (_e, slug) => ({ canRun: !!POD_LOCAL_DIRS[slug], slug }));

// Sync the pod onto the local runtime (if needed) then call its tool.
ipcMain.handle('runtime:run', async (_e, { slug, toolName, config, input }) => {
  try {
    if (!POD_LOCAL_DIRS[slug]) {
      return { ok: false, error: `Pod "${slug}" has no local source on this device yet.` };
    }
    const list = await runtimeFetch('/pods').catch(() => ({ pods: [] }));
    const synced = (list.pods || []).some((p) => p.slug === slug);
    if (!synced) {
      await runtimeFetch('/pods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, toolName, image: slug, config: config || {} }),
      });
    }
    const res = await runtimeFetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: toolName, arguments: input || {} } }),
    });
    if (res.error) return { ok: false, error: res.error.message };
    const output = res.result?.structuredContent ?? res.result ?? {};
    return { ok: true, output, confidence: Number(output.confidence ?? 0.9) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
