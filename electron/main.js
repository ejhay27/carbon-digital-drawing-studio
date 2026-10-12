import { app, BrowserWindow, Menu, shell, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { atomicWriteFile } from './atomic-write.js';
import { createLibraryStore } from './library-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.setName('CARBON PRIME');

const DEV_URL = 'http://localhost:5173';
const distPath = path.join(__dirname, '..', 'dist', 'index.html');
const preloadPath = path.join(__dirname, 'preload.cjs');
const MAX_PROJECT_BYTES = 1024 * 1024 * 1024;
const PROJECT_EXTENSIONS = new Set(['carbon', 'carboncomic']);
const EXPORT_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg', 'mp4', 'webm', 'zip', 'pdf', 'json', 'carbon', 'carboncomic', 'carbonpack', 'carbonbrush', 'gpl', 'txt']);
const projectTokens = new WeakMap();

const libraryRoot = () => path.join(app.getPath('userData'), 'Carbon Library');
const libraryStore = createLibraryStore({ rootPath: libraryRoot });
const extensionOf = (name) => path.extname(String(name || '')).slice(1).toLowerCase();

function safeBaseName(value, fallback) {
  let name = path.basename(String(value || ''), path.extname(String(value || '')))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim();
  if (!name || name === '.' || name === '..') name = fallback;
  return name.slice(0, 120) || fallback;
}

function bytesFromIpc(value, label = 'file') {
  let bytes;
  if (value instanceof ArrayBuffer) bytes = Buffer.from(value);
  else if (Buffer.isBuffer(value)) bytes = value;
  else if (value instanceof Uint8Array) bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  else throw new Error(`The ${label} data is not a byte buffer.`);
  if (!bytes.byteLength) throw new Error(`The ${label} is empty.`);
  if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error(`The ${label} is larger than the 1 GB desktop file limit.`);
  return bytes;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function senderTokens(sender) {
  let map = projectTokens.get(sender);
  if (!map) { map = new Map(); projectTokens.set(sender, map); }
  return map;
}
function rememberPath(sender, filePath) {
  const fileId = randomUUID();
  senderTokens(sender).set(fileId, filePath);
  return fileId;
}
function windowFor(sender) { return BrowserWindow.fromWebContents(sender) || undefined; }

async function saveProject(event, input = {}) {
  const extension = input.extension;
  if (!PROJECT_EXTENSIONS.has(extension)) throw new Error('Unsupported Carbon project extension.');
  const bytes = bytesFromIpc(input.bytes, 'project');
  const tokens = senderTokens(event.sender);
  let destination = typeof input.fileId === 'string' ? tokens.get(input.fileId) : null;
  if (destination && extensionOf(destination) !== extension) destination = null;
  let fileId = destination && input.fileId ? input.fileId : null;

  if (!destination) {
    const name = `${safeBaseName(input.name, 'Untitled')}.${extension}`;
    const result = await dialog.showSaveDialog(windowFor(event.sender), {
      title: extension === 'carboncomic' ? 'Save Carbon Comic project' : 'Save Carbon project',
      defaultPath: name,
      filters: [{ name: extension === 'carboncomic' ? 'Carbon Comic project' : 'Carbon project', extensions: [extension] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    destination = result.filePath;
  }

  if (extensionOf(destination) !== extension) destination += `.${extension}`;
  await atomicWriteFile(destination, bytes);
  if (!fileId) fileId = rememberPath(event.sender, destination);
  return { canceled: false, fileId, path: destination, name: path.basename(destination), bytesWritten: bytes.byteLength };
}

async function openProject(event) {
  const result = await dialog.showOpenDialog(windowFor(event.sender), {
    title: 'Open Carbon artwork',
    properties: ['openFile'],
    filters: [{ name: 'Carbon artwork', extensions: ['carbon', 'carboncomic'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  const extension = extensionOf(filePath);
  if (!PROJECT_EXTENSIONS.has(extension)) throw new Error('Choose a .carbon or .carboncomic project.');
  const bytes = await fs.readFile(filePath);
  if (!bytes.byteLength || bytes.byteLength > MAX_PROJECT_BYTES) throw new Error('The selected Carbon project is empty or larger than the 1 GB desktop file limit.');
  return { canceled: false, fileId: rememberPath(event.sender, filePath), path: filePath, name: path.basename(filePath), extension, bytes: toArrayBuffer(bytes) };
}

async function saveExport(event, input = {}) {
  const bytes = bytesFromIpc(input.bytes, 'export');
  const extension = extensionOf(input.name);
  if (!EXPORT_EXTENSIONS.has(extension)) throw new Error('Unsupported export file type.');
  const suggestedName = `${safeBaseName(input.name, 'Carbon artwork')}.${extension}`;
  const result = await dialog.showSaveDialog(windowFor(event.sender), {
    title: 'Export Carbon artwork',
    defaultPath: suggestedName,
    filters: [{ name: `${extension.toUpperCase()} export`, extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  let destination = result.filePath;
  if (extensionOf(destination) !== extension) destination += `.${extension}`;
  await atomicWriteFile(destination, bytes);
  return { canceled: false, path: destination, name: path.basename(destination), bytesWritten: bytes.byteLength };
}

ipcMain.handle('carbon:project-open', (event) => openProject(event));
ipcMain.handle('carbon:project-save', (event, input) => saveProject(event, input));
ipcMain.handle('carbon:export-save', (event, input) => saveExport(event, input));
ipcMain.handle('carbon:library-put', (_event, input) => libraryStore.put(input));
ipcMain.handle('carbon:library-list', () => libraryStore.list());
ipcMain.handle('carbon:library-get', (_event, id) => libraryStore.get(id));
ipcMain.handle('carbon:library-delete', (_event, id) => libraryStore.delete(id));

function createWindow() {
  const hasDist = fsSync.existsSync(distPath);
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#141416',
    title: 'CARBON PRIME',
    icon: fsSync.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  if (hasDist) void win.loadFile(distPath);
  else void win.loadURL(DEV_URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.session.on('will-download', (_event, item) => {
    const result = dialog.showSaveDialogSync(win, { defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    if (result) item.setSavePath(result);
    else item.cancel();
  });
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
