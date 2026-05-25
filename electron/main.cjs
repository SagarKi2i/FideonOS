const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile, exec } = require('child_process');
const fs = require('fs');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

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

  // Dev: Next.js dev server on port 3000
  // Prod: Next.js standalone server (start with: node .next/standalone/server.js)
  const startURL = isDev
    ? 'http://localhost:3000/electron-playground'
    : 'http://localhost:3000/electron-playground'; // prod: start next server before app.

  mainWindow.loadURL(startURL);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
      const winswExe = path.join(SERVICE_DIR, 'windows', 'winsw.exe');
      if (!fs.existsSync(winswExe)) {
        return { ok: false, output: 'winsw.exe not found. Download WinSW v3 and place it in electron/service/windows/.' };
      }
      const stop = await runCommand(winswExe, ['stop']);
      const uninstall = await runCommand(winswExe, ['uninstall']);
      return runCommand(winswExe, ['install']);
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
      const winswExe = path.join(SERVICE_DIR, 'windows', 'winsw.exe');
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
      const winswExe = path.join(SERVICE_DIR, 'windows', 'winsw.exe');
      if (!fs.existsSync(winswExe)) return { installed: false, running: false, output: 'winsw.exe not found' };
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
