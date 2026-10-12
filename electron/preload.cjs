const { contextBridge, ipcRenderer } = require('electron');

// Expose only the app's typed project-file and Library operations. No Node APIs or generic IPC
// channel are made available to the renderer.
contextBridge.exposeInMainWorld('carbonDesktop', Object.freeze({
  openProject: () => ipcRenderer.invoke('carbon:project-open'),
  saveProject: (input) => ipcRenderer.invoke('carbon:project-save', input),
  saveExport: (input) => ipcRenderer.invoke('carbon:export-save', input),
  putLibraryProject: (input) => ipcRenderer.invoke('carbon:library-put', input),
  listLibraryProjects: () => ipcRenderer.invoke('carbon:library-list'),
  getLibraryProject: (id) => ipcRenderer.invoke('carbon:library-get', id),
  deleteLibraryProject: (id) => ipcRenderer.invoke('carbon:library-delete', id),
}));
