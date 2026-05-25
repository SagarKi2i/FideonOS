const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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

ipcMain.handle('network:check-status', async () => {
  try {
    const response = await fetch('https://www.google.com', { method: 'HEAD' });
    return { online: response.ok };
  } catch {
    return { online: false };
  }
});
