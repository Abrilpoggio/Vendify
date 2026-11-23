'use strict';
const { app, BrowserWindow, ipcMain, dialog, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./db');
const { createApi } = require('./api');
const L = require('./license');

let secret = null;
try { secret = require('./license-secret'); } catch (e) { /* se informa en pantalla */ }

if (!app.requestSingleInstanceLock()) app.quit();

let win, api;

function createLicense() {
  const file = path.join(app.getPath('userData'), 'license.json');
  const machineId = L.getMachineId();
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).key; } catch (e) { return null; } };
  return {
    machineId,
    // Se re-verifica en cada arranque contra el ID de ESTA PC: copiar el archivo a otra PC no sirve.
    isActivated: () => !!secret && !!read() && L.verifyKey(machineId, read(), secret),
    activate(key) {
      if (!secret) throw new Error('Build sin secreto de licencias (falta src/license-secret.js)');
      if (!L.verifyKey(machineId, key, secret)) return false;
      fs.writeFileSync(file, JSON.stringify({ key: L.normalizeKey(key), machineId, at: new Date().toISOString() }));
      return true;
    },
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 1024, minHeight: 650, backgroundColor: '#0f1115',
    title: 'Vendify Kiosco', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
  win.webContents.on('did-start-loading', () => { try { api.handle('admin:lock'); } catch (e) {} }); // recargar = salir de admin
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const store = new Store(path.join(app.getPath('userData'), 'vendify-data.json'));
  const license = createLicense();
  api = createApi(store, license);

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media')); // cámara
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');

  ipcMain.handle('rpc', (e, channel, arg) => {
    try {
      // Sin licencia solo se permite el canal de activación
      if (!channel.startsWith('license:') && !license.isActivated()) throw new Error('Programa no activado');
      return { ok: true, data: api.handle(channel, arg) };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('saveCsv', async (e, name, content) => {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: name, filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    fs.writeFileSync(r.filePath, '\uFEFF' + content, 'utf8'); // BOM para que Excel respete tildes
    return { ok: true, path: r.filePath };
  });

  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
