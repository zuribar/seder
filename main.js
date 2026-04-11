const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow;
let lastScannedPath = null;
let scannedFilePaths = new Set();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'SortBox - Media Organizer',
    icon: path.join(__dirname, 'src', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===== File type categories =====
const FILE_CATEGORIES = {
  videos: {
    name: 'Video',
    nameEn: 'Videos',
    extensions: ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.ts', '.vob', '.3gp'],
    icon: '🎬',
  },
  images: {
    name: 'Images',
    nameEn: 'Images',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.svg', '.ico', '.raw', '.cr2', '.nef', '.dng', '.heic', '.heif'],
    icon: '🖼️',
  },
  graphics: {
    name: 'Graphics',
    nameEn: 'Graphics',
    extensions: ['.psd', '.ai', '.eps', '.indd', '.sketch', '.fig', '.xd', '.cdr'],
    icon: '🎨',
  },
  audio: {
    name: 'Audio',
    nameEn: 'Audio',
    extensions: ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.aiff', '.aif', '.mid', '.midi'],
    icon: '🎵',
  },
  projects: {
    name: 'Projects',
    nameEn: 'Projects',
    extensions: ['.aep', '.aet', '.prproj', '.drp', '.nk', '.comp', '.mogrt', '.sesx', '.als', '.flp', '.ptx'],
    icon: '📁',
  },
  threed: {
    name: '3D',
    nameEn: '3D',
    extensions: ['.obj', '.fbx', '.blend', '.c4d', '.3ds', '.stl', '.dae', '.gltf', '.glb', '.usd', '.usda', '.usdz', '.ma', '.mb'],
    icon: '🧊',
  },
  plugins: {
    name: 'Plugins',
    nameEn: 'Plugins',
    extensions: ['.dll', '.vst', '.vst3', '.component', '.aex', '.ofx', '.8bf', '.plugin', '.bundle'],
    icon: '🔌',
  },
  fonts: {
    name: 'Fonts',
    nameEn: 'Fonts',
    extensions: ['.ttf', '.otf', '.woff', '.woff2', '.eot', '.fon'],
    icon: '🔤',
  },
  documents: {
    name: 'Documents',
    nameEn: 'Documents',
    extensions: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'],
    icon: '📄',
  },
  archives: {
    name: 'Archives',
    nameEn: 'Archives',
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.dmg'],
    icon: '📦',
  },
  luts: {
    name: 'LUTs',
    nameEn: 'LUTs',
    extensions: ['.cube', '.3dl', '.look', '.lut'],
    icon: '🎛️',
  },
  presets: {
    name: 'Presets',
    nameEn: 'Presets',
    extensions: ['.ffx', '.sfl', '.xmp', '.lrtemplate'],
    icon: '⚙️',
  },
};

function getCategory(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [key, cat] of Object.entries(FILE_CATEGORIES)) {
    if (cat.extensions.includes(ext)) {
      return { key, ...cat };
    }
  }
  return null;
}

// ===== IPC Handlers =====

// Select folder dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select a folder to scan',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Select destination folder
ipcMain.handle('select-destination', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select destination folder',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Scan folder
ipcMain.handle('scan-folder', async (event, folderPath) => {
  // Validate folderPath
  let folderStat;
  try {
    folderStat = fs.statSync(folderPath);
  } catch (err) {
    throw new Error('Invalid folder path: ' + folderPath);
  }
  if (!folderStat.isDirectory()) {
    throw new Error('Path is not a directory: ' + folderPath);
  }
  lastScannedPath = folderPath;
  scannedFilePaths = new Set();

  const results = {
    files: [],
    categories: {},
    totalSize: 0,
    duplicates: [],
    unknown: [],
  };

  // Init category counters
  for (const [key, cat] of Object.entries(FILE_CATEGORIES)) {
    results.categories[key] = { ...cat, count: 0, size: 0, files: [] };
  }

  const hashMap = new Map(); // For duplicate detection
  let scannedCount = 0;

  async function scanDir(startDir) {
    const dirQueue = [startDir];
    while (dirQueue.length > 0) {
      const dir = dirQueue.shift();
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (err) {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$RECYCLE.BIN' || entry.name === 'System Volume Information') {
            continue;
          }
          dirQueue.push(fullPath);
        } else if (entry.isFile()) {
          const category = getCategory(fullPath);
          let stat;
          try {
            stat = await fs.promises.stat(fullPath);
          } catch {
            continue;
          }

          const fileInfo = {
            path: fullPath,
            name: entry.name,
            ext: path.extname(entry.name).toLowerCase(),
            size: stat.size,
            modified: stat.mtime,
            category: category ? category.key : 'unknown',
            categoryName: category ? category.name : 'Unknown',
            icon: category ? category.icon : '❓',
          };

          if (category) {
            results.categories[category.key].count++;
            results.categories[category.key].size += stat.size;
            results.categories[category.key].files.push(fileInfo);
          } else {
            results.unknown.push(fileInfo);
          }

          results.files.push(fileInfo);
          results.totalSize += stat.size;
          scannedFilePaths.add(fullPath);

          // Duplicate detection by size + partial hash
          const sizeKey = stat.size.toString();
          if (stat.size > 0) {
            if (hashMap.has(sizeKey)) {
              hashMap.get(sizeKey).push(fileInfo);
            } else {
              hashMap.set(sizeKey, [fileInfo]);
            }
          }

          scannedCount++;
          if (scannedCount % 100 === 0) {
            mainWindow.webContents.send('scan-progress', {
              count: scannedCount,
              current: fullPath,
            });
          }
        }
      }
    }
  }

  await scanDir(folderPath);

  // Find potential duplicates (same size files)
  // Step 1: Quick filter by partial hash (first 8KB + last 8KB)
  // Step 2: Verify with full file hash for accuracy
  for (const [sizeKey, files] of hashMap.entries()) {
    const fileSize = parseInt(sizeKey);
    if (files.length > 1 && fileSize > 1024) {

      // Step 1: Partial hash to quickly filter candidates
      const partialHashGroups = new Map();
      for (const file of files) {
        try {
          const fileHandle = await fs.promises.open(file.path, 'r');
          const headBuf = Buffer.alloc(Math.min(8192, fileSize));
          await fileHandle.read(headBuf, 0, headBuf.length, 0);

          let combinedBuf = headBuf;
          // Also read last 8KB if file is large enough
          if (fileSize > 16384) {
            const tailBuf = Buffer.alloc(8192);
            await fileHandle.read(tailBuf, 0, 8192, fileSize - 8192);
            combinedBuf = Buffer.concat([headBuf, tailBuf]);
          }
          await fileHandle.close();

          const partialHash = crypto.createHash('sha256').update(combinedBuf).digest('hex');
          if (partialHashGroups.has(partialHash)) {
            partialHashGroups.get(partialHash).push(file);
          } else {
            partialHashGroups.set(partialHash, [file]);
          }
        } catch {
          continue;
        }
      }

      // Step 2: Full hash verification for candidates
      for (const [, candidates] of partialHashGroups.entries()) {
        if (candidates.length > 1) {
          const fullHashGroups = new Map();
          for (const file of candidates) {
            try {
              const fullHash = await new Promise((resolve, reject) => {
                const hash = crypto.createHash('sha256');
                const stream = fs.createReadStream(file.path);
                stream.on('data', chunk => hash.update(chunk));
                stream.on('end', () => resolve(hash.digest('hex')));
                stream.on('error', reject);
              });

              if (fullHashGroups.has(fullHash)) {
                fullHashGroups.get(fullHash).push(file);
              } else {
                fullHashGroups.set(fullHash, [file]);
              }
            } catch {
              continue;
            }
          }

          for (const [fullHash, group] of fullHashGroups.entries()) {
            if (group.length > 1) {
              results.duplicates.push({
                hash: fullHash,
                size: fileSize,
                files: group,
              });
            }
          }
        }
      }
    }
  }

  return results;
});

// Helper: async file existence check
async function fileExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

// Organize files
ipcMain.handle('organize-files', async (event, { files, destination, mode }) => {
  const results = { moved: 0, errors: [], skipped: 0 };

  // Validate all file paths start with the last scanned path
  for (const file of files) {
    if (!lastScannedPath || !file.path.startsWith(lastScannedPath)) {
      throw new Error('File path is outside of scanned folder: ' + file.path);
    }
  }

  for (const file of files) {
    const category = getCategory(file.path);
    if (!category) {
      results.skipped++;
      continue;
    }

    const categoryFolder = path.join(destination, category.nameEn);
    const extFolder = path.join(categoryFolder, file.ext.replace('.', '').toUpperCase());

    // Create directories
    try {
      await fs.promises.mkdir(extFolder, { recursive: true });
    } catch (err) {
      results.errors.push({ file: file.path, error: err.message });
      continue;
    }

    const destPath = path.join(extFolder, file.name);

    // Handle name conflicts
    let finalDest = destPath;
    if (await fileExists(destPath)) {
      const baseName = path.basename(file.name, file.ext);
      let counter = 1;
      while (await fileExists(finalDest)) {
        finalDest = path.join(extFolder, `${baseName} (${counter})${file.ext}`);
        counter++;
      }
    }

    try {
      if (mode === 'copy') {
        await fs.promises.copyFile(file.path, finalDest);
      } else {
        await fs.promises.rename(file.path, finalDest);
      }
      results.moved++;
    } catch (err) {
      // If rename fails (cross-device), try copy + delete
      if (err.code === 'EXDEV' && mode === 'move') {
        try {
          await fs.promises.copyFile(file.path, finalDest);
          await fs.promises.unlink(file.path);
          results.moved++;
        } catch (err2) {
          results.errors.push({ file: file.path, error: err2.message });
        }
      } else {
        results.errors.push({ file: file.path, error: err.message });
      }
    }

    // Send progress
    mainWindow.webContents.send('organize-progress', {
      moved: results.moved,
      total: files.length,
      current: file.name,
    });
  }

  return results;
});

// Open folder in explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
  let stat;
  try {
    stat = fs.statSync(folderPath);
  } catch (err) {
    throw new Error('Invalid folder path: ' + folderPath);
  }
  if (!stat.isDirectory()) {
    throw new Error('Path is not a directory: ' + folderPath);
  }
  shell.openPath(folderPath);
});

// Delete duplicate files
ipcMain.handle('delete-duplicates', async (event, filePaths) => {
  const results = { deleted: 0, errors: [], freedSpace: 0 };

  // Validate all file paths are in the scanned set
  for (const filePath of filePaths) {
    if (!scannedFilePaths.has(filePath)) {
      throw new Error('File path was not part of the scanned folder: ' + filePath);
    }
  }

  for (const filePath of filePaths) {
    try {
      let size = 0;
      try {
        const stat = fs.statSync(filePath);
        size = stat.size;
      } catch {}
      await shell.trashItem(filePath);
      results.deleted++;
      results.freedSpace += size;
    } catch (err) {
      results.errors.push({ file: filePath, error: err.message });
    }

    mainWindow.webContents.send('delete-progress', {
      deleted: results.deleted,
      total: filePaths.length,
    });
  }

  return results;
});

// Confirm dialog
ipcMain.handle('confirm-dialog', async (event, { title, message, detail }) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Delete'],
    defaultId: 0,
    cancelId: 0,
    title: title || 'Confirm Deletion',
    message: message || 'Are you sure?',
    detail: detail || '',
  });
  return result.response === 1; // true if "Delete" was clicked
});

// Get categories info
ipcMain.handle('get-categories', () => {
  return FILE_CATEGORIES;
});
