import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.setName('CARBON PRIME');

const DEV_URL  = 'http://localhost:5173';
const distPath = path.join(__dirname, '..', 'dist', 'index.html');

function createWindow() {
  const hasDist = fs.existsSync(distPath);
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#141416',
    title: 'CARBON PRIME',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (hasDist) {
    win.loadFile(distPath);
  } else {
    win.loadURL(DEV_URL);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.session.on('will-download', (_event, item) => {
    const savePath = dialog.showSaveDialogSync(win, {
      defaultPath: item.getFilename(),
    });
    if (savePath) item.setSavePath(savePath);
    else item.cancel();
  });

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});