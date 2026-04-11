// ===== State =====
let scanResults = null;
let sourcePath = null;
let destPath = null;
let selectedForDeletion = new Set();
let allFilesVisible = false;
const FILE_LIST_PAGE_SIZE = 100;
let duplicatesShown = 50;
let isOperationRunning = false;

// ===== DOM Elements =====
const $ = (id) => document.getElementById(id);

const steps = {
  source: $('step-source'),
  scanning: $('step-scanning'),
  results: $('step-results'),
  organizing: $('step-organizing'),
  done: $('step-done'),
};

// ===== Utility Functions =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function showStep(stepName) {
  Object.values(steps).forEach((s) => s.classList.add('hidden'));
  steps[stepName].classList.remove('hidden');
}

function updateDeleteButton() {
  const btn = $('btn-delete-selected');
  const count = selectedForDeletion.size;
  $('selected-count').textContent = count;
  if (count > 0) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

// ===== Step 1: Select Source =====
$('btn-select-source').addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (folder) {
    sourcePath = folder;
    $('source-path').textContent = folder;
    $('source-path').classList.remove('hidden');
    $('btn-scan').classList.remove('hidden');
  }
});

// ===== Start Scan =====
$('btn-scan').addEventListener('click', async () => {
  if (isOperationRunning) return;
  isOperationRunning = true;
  showStep('scanning');

  $('scan-progress-bar').classList.add('indeterminate');
  let fileCount = 0;
  window.api.onScanProgress((data) => {
    fileCount = data.count;
    $('scan-count').textContent = `${fileCount} files found`;
    $('scan-status').textContent = data.current
      ? data.current.length > 60
        ? '...' + data.current.slice(-60)
        : data.current
      : 'Scanning...';
  });

  try {
    scanResults = await window.api.scanFolder(sourcePath);
    showResults();
  } catch (err) {
    alert('Scan error: ' + err.message);
    showStep('source');
    isOperationRunning = false;
  }
  isOperationRunning = false;
});

// ===== Show Results =====
function showResults() {
  showStep('results');
  selectedForDeletion.clear();
  duplicatesShown = 50;

  const res = scanResults;

  // Summary
  $('total-files').textContent = res.files.length.toLocaleString();
  $('total-size').textContent = formatSize(res.totalSize);
  $('total-duplicates').textContent = res.duplicates.length.toLocaleString();

  const activeCats = Object.values(res.categories).filter((c) => c.count > 0);
  $('total-categories').textContent = activeCats.length;

  // Toggle all files button
  let toggleBtn = $('toggle-all-files');
  if (!toggleBtn) {
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-all-files';
    toggleBtn.className = 'toggle-all-btn';
    toggleBtn.addEventListener('click', () => {
      allFilesVisible = !allFilesVisible;
      toggleBtn.innerHTML = allFilesVisible
        ? '📋 Hide Files'
        : '📋 Show All Files';
      document.querySelectorAll('.category-files').forEach(el => {
        el.classList.toggle('hidden', !allFilesVisible);
      });
      document.querySelectorAll('.category-card.clickable').forEach(el => {
        el.classList.toggle('expanded', allFilesVisible);
      });
    });
  }
  allFilesVisible = false;
  toggleBtn.innerHTML = '📋 Show All Files';

  // Category cards
  const grid = $('categories-grid');
  grid.innerHTML = '';
  grid.parentNode.insertBefore(toggleBtn, grid);

  const sortedCats = Object.entries(res.categories).sort(
    ([, a], [, b]) => b.count - a.count
  );

  for (const [key, cat] of sortedCats) {
    const card = document.createElement('div');
    card.className = `category-card${cat.count === 0 ? ' empty' : ''}${cat.count > 0 ? ' clickable' : ''}`;
    card.dataset.categoryKey = key;
    card.innerHTML = `
      <div class="category-icon">${escapeHtml(cat.icon)}</div>
      <div class="category-name">${escapeHtml(cat.name)}</div>
      <div class="category-count">${cat.count.toLocaleString()}</div>
      <div class="category-size">${formatSize(cat.size)}</div>
      ${cat.count > 0 ? '<div class="expand-icon">▼</div>' : ''}
    `;

    if (cat.count > 0) {
      const fileListDiv = document.createElement('div');
      fileListDiv.className = 'category-files hidden';
      renderFileList(fileListDiv, cat.files, FILE_LIST_PAGE_SIZE);
      card.appendChild(fileListDiv);

      card.addEventListener('click', (e) => {
        if (e.target.closest('.show-more-btn')) return;
        const fl = card.querySelector('.category-files');
        if (!fl) return;
        const isOpen = !fl.classList.contains('hidden');
        fl.classList.toggle('hidden');
        card.classList.toggle('expanded', !isOpen);
      });
    }

    grid.appendChild(card);
  }

  // Duplicates
  if (res.duplicates.length > 0) {
    const dupSection = $('duplicates-section');
    dupSection.classList.remove('hidden');
    renderDuplicates();
  }

  // Preview folder structure
  buildStructurePreview();
  updateDeleteButton();
}

function refreshSummary() {
  const res = scanResults;
  if (!res) return;

  // Recalculate totalSize from files
  res.totalSize = res.files.reduce((sum, f) => sum + f.size, 0);

  // Recalculate category counts and sizes
  for (const [key, cat] of Object.entries(res.categories)) {
    cat.count = cat.files.length;
    cat.size = cat.files.reduce((sum, f) => sum + f.size, 0);
  }

  // Update summary numbers
  $('total-files').textContent = res.files.length.toLocaleString();
  $('total-size').textContent = formatSize(res.totalSize);
  $('total-duplicates').textContent = res.duplicates.length.toLocaleString();
  const activeCats = Object.values(res.categories).filter((c) => c.count > 0);
  $('total-categories').textContent = activeCats.length;

  // Update category cards
  document.querySelectorAll('.category-card[data-category-key]').forEach(card => {
    const key = card.dataset.categoryKey;
    const cat = res.categories[key];
    if (!cat) return;
    card.querySelector('.category-count').textContent = cat.count.toLocaleString();
    card.querySelector('.category-size').textContent = formatSize(cat.size);
    if (cat.count === 0) {
      card.classList.add('empty');
      card.classList.remove('clickable', 'expanded');
      const fl = card.querySelector('.category-files');
      if (fl) fl.remove();
      const ei = card.querySelector('.expand-icon');
      if (ei) ei.remove();
    } else {
      // Re-render file list if open
      const fl = card.querySelector('.category-files');
      if (fl && !fl.classList.contains('hidden')) {
        renderFileList(fl, cat.files, FILE_LIST_PAGE_SIZE);
      }
    }
  });
}

function removeDeletedFromCategories(deletedSet) {
  for (const [key, cat] of Object.entries(scanResults.categories)) {
    cat.files = cat.files.filter(f => !deletedSet.has(f.path));
  }
}

function renderFileList(container, files, limit) {
  container.innerHTML = '';
  const shown = files.slice(0, limit);
  for (const f of shown) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <span class="file-item-name">${escapeHtml(f.name)}</span>
      <span class="file-item-size">${formatSize(f.size)}</span>
      <span class="file-item-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span>
    `;
    container.appendChild(item);
  }
  if (files.length > limit) {
    const btn = document.createElement('button');
    btn.className = 'show-more-btn';
    btn.textContent = `Show ${Math.min(FILE_LIST_PAGE_SIZE, files.length - limit)} more of ${files.length - limit} remaining`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderFileList(container, files, limit + FILE_LIST_PAGE_SIZE);
    });
    container.appendChild(btn);
  }
}

function getUniqueExtensionsFromDuplicates() {
  const extCounts = {};
  for (const dup of scanResults.duplicates) {
    for (let i = 1; i < dup.files.length; i++) {
      const ext = dup.files[i].ext.toLowerCase();
      if (!extCounts[ext]) extCounts[ext] = { count: 0, size: 0 };
      extCounts[ext].count++;
      extCounts[ext].size += dup.files[i].size;
    }
  }
  return extCounts;
}

function renderExtensionFilters() {
  let container = $('ext-filters');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ext-filters';
    container.className = 'ext-filters';
    const helpText = document.querySelector('.duplicates-help');
    if (helpText) helpText.after(container);
  }
  container.innerHTML = '';

  const extCounts = getUniqueExtensionsFromDuplicates();
  const sorted = Object.entries(extCounts).sort((a, b) => b[1].count - a[1].count);

  if (sorted.length <= 1) return;

  const label = document.createElement('span');
  label.className = 'ext-filters-label';
  label.textContent = 'Delete duplicates by type:';
  container.appendChild(label);

  for (const [ext, info] of sorted) {
    const btn = document.createElement('button');
    btn.className = 'ext-filter-btn';
    btn.innerHTML = `${escapeHtml(ext.toUpperCase())} <small>(${info.count} files, ${formatSize(info.size)})</small>`;
    btn.addEventListener('click', () => deleteByExtension(ext));
    container.appendChild(btn);
  }
}

async function deleteByExtension(ext) {
  if (isOperationRunning) return;
  isOperationRunning = true;
  const paths = [];
  let totalSize = 0;
  for (const dup of scanResults.duplicates) {
    for (let i = 1; i < dup.files.length; i++) {
      if (dup.files[i].ext.toLowerCase() === ext) {
        paths.push(dup.files[i].path);
        totalSize += dup.files[i].size;
      }
    }
  }

  if (paths.length === 0) {
    isOperationRunning = false;
    return;
  }

  const confirmed = await window.api.confirmDialog({
    title: `Delete ${ext.toUpperCase()} Duplicates`,
    message: `Delete ${paths.length} duplicate ${ext.toUpperCase()} files?`,
    detail: `One original copy will be kept from each group.\nThis will free up ${formatSize(totalSize)} of space.\n\nFiles will be moved to the Recycle Bin.`,
  });
  if (!confirmed) {
    isOperationRunning = false;
    return;
  }

  window.api.onDeleteProgress((data) => {
    // Progress shown in UI if needed
  });

  try {
    const result = await window.api.deleteDuplicates(paths);

    const deletedSet = new Set(paths.filter(p => !result.errors.find(e => e.file === p)));
    scanResults.duplicates = scanResults.duplicates
      .map(dup => ({ ...dup, files: dup.files.filter(f => !deletedSet.has(f.path)) }))
      .filter(dup => dup.files.length > 1);
    scanResults.files = scanResults.files.filter(f => !deletedSet.has(f.path));
    removeDeletedFromCategories(deletedSet);
    selectedForDeletion.clear();
    refreshSummary();
    renderDuplicates();
    updateDeleteButton();

    if (scanResults.duplicates.length === 0) {
      $('duplicates-section').classList.add('hidden');
    }

    alert(`✅ Deleted ${result.deleted} duplicate ${ext.toUpperCase()} files! Freed ${formatSize(result.freedSpace)}`);
  } catch (err) {
    alert('Delete error: ' + err.message);
    isOperationRunning = false;
  }
  isOperationRunning = false;
}

function renderDuplicates() {
  const res = scanResults;
  const dupList = $('duplicates-list');
  dupList.innerHTML = '';

  let totalDupSize = 0;
  for (const dup of res.duplicates) {
    totalDupSize += dup.size * (dup.files.length - 1);
  }

  // Show summary of potential space savings
  const savingsNote = document.createElement('div');
  savingsNote.style.cssText = 'color: var(--warning); font-size: 14px; margin-bottom: 12px; font-weight: 600;';
  savingsNote.textContent = `💡 Deleting all duplicates will free ${formatSize(totalDupSize)}`;
  dupList.appendChild(savingsNote);

  // Show paginated duplicate groups
  const shown = res.duplicates.slice(0, duplicatesShown);
  for (let i = 0; i < shown.length; i++) {
    const dup = shown[i];
    const group = document.createElement('div');
    group.className = 'duplicate-group';

    const header = document.createElement('div');
    header.className = 'duplicate-group-header';
    header.innerHTML = `
      <span>${dup.files.length} duplicate files (${formatSize(dup.size)} each)</span>
      <span style="color: var(--text-secondary); font-size: 12px;">hash: ${escapeHtml(dup.hash.substring(0, 8))}...</span>
    `;
    group.appendChild(header);

    for (let j = 0; j < dup.files.length; j++) {
      const f = dup.files[j];
      const isFirst = j === 0;

      const fileDiv = document.createElement('div');
      fileDiv.className = `duplicate-file${isFirst ? ' duplicate-file-original' : ''}${selectedForDeletion.has(f.path) ? ' marked-delete' : ''}`;

      // Open folder button (for all files)
      const openBtn = document.createElement('button');
      openBtn.className = 'open-folder-btn';
      openBtn.title = 'Open in Explorer';
      openBtn.textContent = '📂';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lastSep = Math.max(f.path.lastIndexOf('\\'), f.path.lastIndexOf('/'));
        window.api.openFolder(lastSep > 0 ? f.path.substring(0, lastSep) : f.path);
      });

      if (isFirst) {
        const badge = document.createElement('span');
        badge.className = 'original-badge';
        badge.textContent = 'Keep ✓';

        const pathSpan = document.createElement('span');
        pathSpan.className = 'duplicate-file-path';
        pathSpan.textContent = f.path;

        fileDiv.appendChild(badge);
        fileDiv.appendChild(pathSpan);
        fileDiv.appendChild(openBtn);
      } else {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedForDeletion.has(f.path);
        checkbox.dataset.path = f.path;
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            selectedForDeletion.add(f.path);
            fileDiv.classList.add('marked-delete');
          } else {
            selectedForDeletion.delete(f.path);
            fileDiv.classList.remove('marked-delete');
          }
          updateDeleteButton();
        });

        const pathSpan = document.createElement('span');
        pathSpan.className = 'duplicate-file-path';
        pathSpan.textContent = f.path;

        fileDiv.appendChild(checkbox);
        fileDiv.appendChild(pathSpan);
        fileDiv.appendChild(openBtn);
      }

      group.appendChild(fileDiv);
    }

    dupList.appendChild(group);
  }

  // Pagination buttons
  const remaining = res.duplicates.length - shown.length;
  if (remaining > 0) {
    const pagDiv = document.createElement('div');
    pagDiv.className = 'duplicates-pagination';

    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'btn btn-secondary btn-small';
    loadMoreBtn.innerHTML = `<span class="btn-icon">📄</span> Load ${Math.min(50, remaining)} more (of ${remaining})`;
    loadMoreBtn.addEventListener('click', () => {
      duplicatesShown += 50;
      renderDuplicates();
    });

    const loadAllBtn = document.createElement('button');
    loadAllBtn.className = 'btn btn-secondary btn-small';
    loadAllBtn.innerHTML = `<span class="btn-icon">📋</span> Load all (${remaining})`;
    loadAllBtn.addEventListener('click', () => {
      duplicatesShown = Infinity;
      renderDuplicates();
    });

    pagDiv.appendChild(loadMoreBtn);
    pagDiv.appendChild(loadAllBtn);
    dupList.appendChild(pagDiv);
  }

  // Render extension filter buttons
  renderExtensionFilters();
}

// ===== Auto-select duplicates =====
$('btn-auto-select-dups').addEventListener('click', () => {
  selectedForDeletion.clear();

  // Select all non-first files (keep the first = original)
  for (const dup of scanResults.duplicates) {
    for (let i = 1; i < dup.files.length; i++) {
      selectedForDeletion.add(dup.files[i].path);
    }
  }

  // Re-render with selections
  renderDuplicates();
  updateDeleteButton();
});

// ===== Delete ALL Duplicates (one click) =====
$('btn-delete-all-dups').addEventListener('click', async () => {
  if (!scanResults || scanResults.duplicates.length === 0) return;

  // Collect all duplicate files (keep first = original)
  const allDupPaths = [];
  let totalFreedSize = 0;
  for (const dup of scanResults.duplicates) {
    for (let i = 1; i < dup.files.length; i++) {
      allDupPaths.push(dup.files[i].path);
      totalFreedSize += dup.files[i].size;
    }
  }

  if (allDupPaths.length === 0) return;

  // Disable button immediately before confirm dialog
  const btn = $('btn-delete-all-dups');
  btn.disabled = true;

  // Confirm
  const totalGroups = scanResults.duplicates.length;
  const shownGroups = Math.min(50, totalGroups);
  const hiddenGroups = totalGroups - shownGroups;
  const hiddenWarning = hiddenGroups > 0 ? `\nNote: ${hiddenGroups} duplicate groups not shown in the list will also be deleted!` : '';

  const confirmed = await window.api.confirmDialog({
    title: 'Delete All Duplicates',
    message: `Delete ${allDupPaths.length} duplicate files?`,
    detail: `One original copy will be kept from each group.\nThis will free up ${formatSize(totalFreedSize)} of space.\n\nThis action cannot be undone!${hiddenWarning}`,
  });

  if (!confirmed) {
    btn.disabled = false;
    return;
  }

  btn.innerHTML = '<span class="btn-icon">⏳</span> Deleting...';

  window.api.onDeleteProgress((data) => {
    btn.innerHTML = `<span class="btn-icon">⏳</span> Deleting... ${data.deleted}/${data.total}`;
  });

  try {
    const result = await window.api.deleteDuplicates(allDupPaths);

    // Show result
    const resultDiv = document.createElement('div');
    resultDiv.className = `delete-result ${result.errors.length === 0 ? 'success' : 'error'}`;

    if (result.errors.length === 0) {
      resultDiv.innerHTML = `✅ Successfully deleted ${result.deleted} duplicates! Freed ${formatSize(result.freedSpace)}`;
    } else {
      resultDiv.innerHTML = `
        Deleted ${result.deleted} files (freed ${formatSize(result.freedSpace)}).<br>
        ${result.errors.length} errors during deletion.
      `;
    }

    const dupList = $('duplicates-list');
    dupList.innerHTML = '';
    dupList.appendChild(resultDiv);

    // Remove deleted files from scan results
    const deletedSet = new Set(allDupPaths.filter(p => !result.errors.find(e => e.file === p)));
    scanResults.duplicates = scanResults.duplicates
      .map(dup => ({ ...dup, files: dup.files.filter(f => !deletedSet.has(f.path)) }))
      .filter(dup => dup.files.length > 1);
    scanResults.files = scanResults.files.filter(f => !deletedSet.has(f.path));
    removeDeletedFromCategories(deletedSet);

    // Update summary
    selectedForDeletion.clear();
    refreshSummary();
    updateDeleteButton();

    // Hide section after a moment if all cleared
    setTimeout(() => {
      if (scanResults.duplicates.length === 0) {
        $('duplicates-section').classList.add('hidden');
      } else {
        renderDuplicates();
      }
    }, 2000);

  } catch (err) {
    alert('Delete error: ' + err.message);
  }

  // Reset button
  btn.disabled = false;
  btn.innerHTML = '<span class="btn-icon">🗑️</span> Delete All Duplicates';
});

// ===== Delete Selected Duplicates =====
$('btn-delete-selected').addEventListener('click', async () => {
  const count = selectedForDeletion.size;
  if (count === 0) return;
  if (isOperationRunning) return;
  isOperationRunning = true;
  $('btn-delete-selected').disabled = true;

  // Calculate size that will be freed
  let freedSize = 0;
  for (const dup of scanResults.duplicates) {
    for (const file of dup.files) {
      if (selectedForDeletion.has(file.path)) {
        freedSize += file.size;
      }
    }
  }

  // Confirm
  const confirmed = await window.api.confirmDialog({
    title: 'Confirm Duplicate Deletion',
    message: `Delete ${count} duplicate files?`,
    detail: `This will free up ${formatSize(freedSize)} of space.\nThis action cannot be undone!`,
  });

  if (!confirmed) {
    $('btn-delete-selected').disabled = false;
    isOperationRunning = false;
    return;
  }

  // Delete files
  const filePaths = Array.from(selectedForDeletion);

  window.api.onDeleteProgress((data) => {
    const btnText = $('btn-delete-selected').lastChild;
    if (btnText) btnText.textContent = ` Deleting... ${data.deleted}/${data.total}`;
  });

  try {
    const result = await window.api.deleteDuplicates(filePaths);

    // Show result
    const resultDiv = document.createElement('div');
    resultDiv.className = `delete-result ${result.errors.length === 0 ? 'success' : 'error'}`;

    if (result.errors.length === 0) {
      resultDiv.innerHTML = `✅ Successfully deleted ${result.deleted} duplicates! Freed ${formatSize(result.freedSpace)}`;
    } else {
      resultDiv.innerHTML = `
        Deleted ${result.deleted} files (freed ${formatSize(result.freedSpace)}).<br>
        ${result.errors.length} errors during deletion.
      `;
    }

    const dupList = $('duplicates-list');
    dupList.prepend(resultDiv);

    // Remove deleted files from scan results
    const deletedSet = new Set(filePaths.filter(p => !result.errors.find(e => e.file === p)));

    scanResults.duplicates = scanResults.duplicates
      .map(dup => ({
        ...dup,
        files: dup.files.filter(f => !deletedSet.has(f.path)),
      }))
      .filter(dup => dup.files.length > 1);

    scanResults.files = scanResults.files.filter(f => !deletedSet.has(f.path));
    removeDeletedFromCategories(deletedSet);

    selectedForDeletion.clear();
    refreshSummary();

    // Re-render duplicates
    setTimeout(() => {
      renderDuplicates();
      updateDeleteButton();

      if (scanResults.duplicates.length === 0) {
        $('duplicates-section').classList.add('hidden');
      }
    }, 1500);

  } catch (err) {
    alert('Delete error: ' + err.message);
  }

  // Reset button
  $('btn-delete-selected').disabled = false;
  isOperationRunning = false;
  const countSpan = $('btn-delete-selected').querySelector('#selected-count') || $('selected-count');
  if (countSpan) countSpan.textContent = '0';
  updateDeleteButton();
});

function buildStructurePreview() {
  const res = scanResults;
  const actions = document.querySelector('.organize-actions');

  const old = document.querySelector('.structure-preview');
  if (old) old.remove();

  const preview = document.createElement('div');
  preview.className = 'structure-preview';

  let html = '<div><span class="folder">📁 Organized/</span></div>';

  const sortedCats = Object.entries(res.categories)
    .filter(([, cat]) => cat.count > 0)
    .sort(([, a], [, b]) => b.count - a.count);

  for (const [key, cat] of sortedCats) {
    html += `<div>&nbsp;&nbsp;<span class="folder">📁 ${escapeHtml(cat.nameEn)}/</span> <span class="count">(${cat.count} files)</span></div>`;

    const extGroups = {};
    for (const file of cat.files) {
      const ext = file.ext.replace('.', '').toUpperCase();
      if (!extGroups[ext]) extGroups[ext] = 0;
      extGroups[ext]++;
    }

    for (const [ext, count] of Object.entries(extGroups).sort((a, b) => b[1] - a[1])) {
      html += `<div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="folder">📁 ${escapeHtml(ext)}/</span> <span class="count">(${count} files)</span></div>`;
    }
  }

  preview.innerHTML = html;
  actions.insertBefore(preview, actions.querySelector('.organize-options'));
}

// ===== Select Destination =====
$('btn-select-dest').addEventListener('click', async () => {
  const folder = await window.api.selectDestination();
  if (folder) {
    destPath = folder;
    $('dest-path').textContent = folder;
    $('dest-path').classList.remove('hidden');
    $('btn-organize').classList.remove('hidden');
  }
});

// ===== Organize =====
$('btn-organize').addEventListener('click', async () => {
  if (isOperationRunning) return;
  isOperationRunning = true;
  const mode = document.querySelector('input[name="organize-mode"]:checked').value;

  if (sourcePath === destPath) {
    alert('Error: Source and destination folders are the same! Please select a different destination.');
    isOperationRunning = false;
    return;
  }
  if (destPath.startsWith(sourcePath + '\\') || destPath.startsWith(sourcePath + '/')) {
    alert('Error: Destination is inside the source folder! Please select a different destination.');
    isOperationRunning = false;
    return;
  }

  const allFiles = scanResults.files.filter((f) => f.category !== 'unknown');

  if (mode === 'move') {
    const confirmed = await window.api.confirmDialog({
      title: 'Confirm File Move',
      message: `Move ${allFiles.length} files to destination?`,
      detail: `Files will be moved from:\n${sourcePath}\nTo:\n${destPath}\n\nOriginal files will be removed from their current location!`,
    });
    if (!confirmed) {
      isOperationRunning = false;
      return;
    }
  }

  showStep('organizing');

  window.api.onOrganizeProgress((data) => {
    const percent = Math.round((data.moved / data.total) * 100);
    $('organize-progress-bar').style.width = percent + '%';
    $('organize-count').textContent = `${data.moved} / ${data.total}`;
    $('organize-status').textContent = data.current || 'Moving files...';
  });

  try {
    const result = await window.api.organizeFiles({
      files: allFiles,
      destination: destPath,
      mode: mode,
    });

    showDone(result, mode);
  } catch (err) {
    alert('Organize error: ' + err.message);
    showStep('results');
    isOperationRunning = false;
  }
  isOperationRunning = false;
});

// ===== Done =====
function showDone(result, mode) {
  showStep('done');

  const summary = $('done-summary');
  summary.innerHTML = `
    <p>Files ${mode === 'copy' ? 'copied' : 'moved'}: <span>${result.moved}</span></p>
    ${result.skipped > 0 ? `<p>Skipped (unrecognized): <span>${result.skipped}</span></p>` : ''}
    ${result.errors.length > 0 ? `<p>Errors: <span style="color: var(--danger)">${result.errors.length}</span></p>` : ''}
    <p>Destination: <span style="font-size: 12px; direction: ltr">${escapeHtml(destPath)}</span></p>
  `;
}

$('btn-open-dest').addEventListener('click', () => {
  if (destPath) window.api.openFolder(destPath);
});

$('btn-restart').addEventListener('click', () => {
  scanResults = null;
  sourcePath = null;
  destPath = null;
  selectedForDeletion.clear();
  $('source-path').classList.add('hidden');
  $('btn-scan').classList.add('hidden');
  $('dest-path').classList.add('hidden');
  $('btn-organize').classList.add('hidden');
  $('duplicates-section').classList.add('hidden');
  showStep('source');
});

$('btn-back-source').addEventListener('click', () => {
  scanResults = null;
  destPath = null;
  selectedForDeletion.clear();
  $('dest-path').classList.add('hidden');
  $('btn-organize').classList.add('hidden');
  $('duplicates-section').classList.add('hidden');
  showStep('source');
});
