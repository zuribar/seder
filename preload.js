const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectDestination: () => ipcRenderer.invoke('select-destination'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  organizeFiles: (options) => ipcRenderer.invoke('organize-files', options),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  deleteDuplicates: (filePaths) => ipcRenderer.invoke('delete-duplicates', filePaths),
  confirmDialog: (options) => ipcRenderer.invoke('confirm-dialog', options),

  // Events from main process
  onScanProgress: (callback) => {
    ipcRenderer.removeAllListeners('scan-progress');
    ipcRenderer.on('scan-progress', (event, data) => callback(data));
  },
  onOrganizeProgress: (callback) => {
    ipcRenderer.removeAllListeners('organize-progress');
    ipcRenderer.on('organize-progress', (event, data) => callback(data));
  },
  onDeleteProgress: (callback) => {
    ipcRenderer.removeAllListeners('delete-progress');
    ipcRenderer.on('delete-progress', (event, data) => callback(data));
  },
});
