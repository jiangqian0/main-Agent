// Workspace Page JavaScript
const API_BASE_URL = '/api';
let currentFile = null;
let isDirty = false;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSidebarResize();
    initEditorResize();
    loadFiles();
});

function checkAuth() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (!session) window.location.href = '/login';
}

function logout() {
    localStorage.removeItem('agent_session');
    sessionStorage.removeItem('agent_session');
    window.location.href = '/login';
}

function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('sidebar-resize-handle');
    let dragging = false;
    handle && handle.addEventListener('mousedown', e => {
        dragging = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        sidebar.style.width = Math.min(400, Math.max(200, e.clientX)) + 'px';
    });
    document.addEventListener('mouseup', () => {
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}

function initEditorResize() {
    const divider = document.getElementById('editor-divider');
    const fileTree = document.getElementById('file-tree');
    const fileEditor = document.getElementById('file-editor');
    if (!divider || !fileTree || !fileEditor) return;
    let dragging = false;
    divider.addEventListener('mousedown', e => {
        dragging = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        const w = e.clientX;
        if (w >= 180 && w <= 500) {
            fileTree.style.width = w + 'px';
        }
    });
    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

function loadFiles() {
    document.getElementById('file-tree').innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    fetch(`${API_BASE_URL}/workspace/files`)
        .then(r => r.ok ? r.json() : [])
        .then(files => {
            files = Array.isArray(files) ? files : [];
            const tree = buildTree(files);
            document.getElementById('file-tree').innerHTML = renderTree(tree);
            updateFileCount(files.length);
        })
        .catch(() => {
            document.getElementById('file-tree').innerHTML = '<div class="loading-state"><i class="fa-solid fa-exclamation-circle"></i> Failed to load</div>';
        });
}

function updateFileCount(count) {
    const header = document.querySelector('.header-title');
    if (header) header.textContent = `Workspace (${count} files)`;
}

function buildTree(files) {
    const root = { name: 'workspace', type: 'folder', children: [], open: true };
    files.forEach(f => {
        const parts = (f.path || '').replace(/\\/g, '/').split('/').filter(Boolean);
        let cur = root;
        parts.forEach((p, i) => {
            let child = cur.children.find(c => c.name === p);
            if (!child) {
                child = {
                    name: p,
                    type: i === parts.length - 1 ? 'file' : 'folder',
                    children: [],
                    path: f.path,
                    open: false
                };
                cur.children.push(child);
            }
            cur = child;
        });
    });
    sortTree(root);
    return root;
}

function sortTree(node) {
    if (node.type === 'folder') {
        node.children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortTree);
    }
}

function renderTree(node, lvl = 0) {
    if (node.type === 'file') {
        const icon = getFileIcon(node.name);
        const active = currentFile === node.path ? 'active' : '';
        return `<li class="file-item ${active}" data-path="${escapeHtml(node.path)}" onclick="openFile('${node.path.replace(/'/g, "\\'")}')" title="${escapeHtml(node.path)}">
            <i class="fa-solid ${icon}"></i>
            <span class="file-name">${escapeHtml(node.name)}</span>
        </li>`;
    }

    const icon = node.open ? 'fa-folder-open' : 'fa-folder';
    const children = node.children.map(c => renderTree(c, lvl + 1)).join('');
    const display = node.open ? '' : 'display:none';
    return `
        <li class="folder-item">
            <div class="folder-header" onclick="toggleFolder(this)">
                <i class="fa-solid fa-chevron-right folder-toggle ${node.open ? 'open' : ''}"></i>
                <i class="fa-solid ${icon}"></i>
                <span class="folder-name">${escapeHtml(node.name)}</span>
                <span class="folder-count">${node.children.length}</span>
            </div>
            <ul class="folder-children" style="${display}">${children}</ul>
        </li>`;
}

function toggleFolder(el) {
    const toggle = el.querySelector('.folder-toggle');
    const children = el.nextElementSibling;
    const isOpen = toggle.classList.toggle('open');
    toggle.classList.toggle('fa-chevron-down', isOpen);
    toggle.classList.toggle('fa-chevron-right', !isOpen);
    if (children) children.style.display = isOpen ? '' : 'none';
}

function getFileIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const icons = {
        py: 'fa-brands fa-python',
        js: 'fa-brands fa-js',
        ts: 'fa-brands fa-js',
        jsx: 'fa-brands fa-react',
        tsx: 'fa-brands fa-react',
        html: 'fa-brands fa-html5',
        css: 'fa-brands fa-css3-alt',
        json: 'fa-solid fa-brackets-curly',
        md: 'fa-brands fa-markdown',
        yaml: 'fa-solid fa-file-code',
        yml: 'fa-solid fa-file-code',
        sh: 'fa-solid fa-terminal',
        bash: 'fa-solid fa-terminal',
        sql: 'fa-solid fa-database',
        go: 'fa-solid fa-golang',
        rs: 'fa-solid fa-rust',
        java: 'fa-brands fa-java',
        cpp: 'fa-solid fa-c',
        c: 'fa-solid fa-c',
        rb: 'fa-solid fa-gem',
        php: 'fa-brands fa-php',
        xml: 'fa-solid fa-file-code',
        txt: 'fa-solid fa-file-lines',
    };
    return icons[ext] || 'fa-solid fa-file';
}

function openFile(path) {
    if (isDirty && !confirm('Unsaved changes. Discard?')) return;
    currentFile = path;
    isDirty = false;
    const editor = document.getElementById('file-editor');
    const fileName = path.split('/').pop();
    const lang = fileName.split('.').pop() || 'text';
    editor.innerHTML = `
        <div class="editor-toolbar">
            <div class="editor-toolbar-left">
                <i class="fa-solid ${getFileIcon(fileName)}"></i>
                <span class="editor-filename" title="${escapeHtml(path)}">${escapeHtml(fileName)}</span>
                <span class="editor-path">${escapeHtml(path)}</span>
            </div>
            <div class="editor-toolbar-right">
                <button class="btn btn-outline btn-sm" onclick="copyFilePath()"><i class="fa-solid fa-copy"></i> Copy Path</button>
                <button class="btn btn-primary btn-sm" onclick="saveFile()"><i class="fa-solid fa-save"></i> Save</button>
                <button class="btn btn-danger-outline btn-sm" onclick="deleteFile()"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
        <div class="editor-content">
            <textarea id="file-content" class="file-editor-textarea language-${lang}" placeholder="Loading..." spellcheck="false"></textarea>
        </div>
        <div class="editor-statusbar">
            <span id="editor-lang">${lang.toUpperCase()}</span>
            <span id="editor-lines">0 lines</span>
            <span id="editor-changed" style="display:none;color:var(--warning);"><i class="fa-solid fa-circle"></i> Modified</span>
        </div>
    `;

    // Load file content
    fetch(`${API_BASE_URL}/workspace/files/${encodeURIComponent(path)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            const ta = document.getElementById('file-content');
            ta.value = data.content || '';
            ta.addEventListener('input', onEditorChange);
            updateEditorStatus();
            // Re-render tree to show active
            loadFiles();
        })
        .catch(() => {
            document.getElementById('file-content').value = '// Failed to load file';
        });
}

function onEditorChange() {
    isDirty = true;
    updateEditorStatus();
}

function updateEditorStatus() {
    const ta = document.getElementById('file-content');
    const linesEl = document.getElementById('editor-lines');
    const changedEl = document.getElementById('editor-changed');
    if (ta && linesEl) {
        const lines = (ta.value.match(/\n/g) || []).length + 1;
        linesEl.textContent = `${lines} lines`;
    }
    if (changedEl) changedEl.style.display = isDirty ? '' : 'none';
}

function saveFile() {
    if (!currentFile) return;
    const content = document.getElementById('file-content').value;
    fetch(`${API_BASE_URL}/workspace/files/${encodeURIComponent(currentFile)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    })
        .then(r => r.ok ? null : Promise.reject())
        .then(() => {
            isDirty = false;
            updateEditorStatus();
            showToast('File saved');
        })
        .catch(() => showToast('Failed to save', 'error'));
}

function copyFilePath() {
    if (!currentFile) return;
    navigator.clipboard.writeText(currentFile).then(() => showToast('Path copied'));
}

function deleteFile() {
    if (!currentFile || !confirm(`Delete "${currentFile}"?`)) return;
    fetch(`${API_BASE_URL}/workspace/files/${encodeURIComponent(currentFile)}`, { method: 'DELETE' })
        .then(r => r.ok ? null : Promise.reject())
        .then(() => {
            currentFile = null;
            isDirty = false;
            document.getElementById('file-editor').innerHTML = `
                <div class="editor-placeholder">
                    <i class="fa-solid fa-file-lines"></i>
                    <p>Select a file to view or edit</p>
                </div>`;
            loadFiles();
            showToast('File deleted');
        })
        .catch(() => showToast('Delete failed', 'error'));
}

function refreshFiles() { loadFiles(); }

function showUploadDialog() {
    document.getElementById('dialog-title').textContent = 'Upload File';
    document.getElementById('dialog-body').innerHTML = `
        <div class="form-group">
            <label>Select File</label>
            <input type="file" id="upload-file" style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;">
        </div>
        <div class="form-group">
            <label>Destination Path (optional)</label>
            <input type="text" id="upload-dest" placeholder="e.g., uploads/myfile.txt" style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box;">
        </div>
    `;
    document.getElementById('dialog-confirm').textContent = 'Upload';
    document.getElementById('dialog-confirm').onclick = uploadFile;
    document.getElementById('dialog-overlay').classList.add('show');
}

function uploadFile() {
    const file = document.getElementById('upload-file').files[0];
    if (!file) { showToast('Select a file', 'error'); return; }
    const formData = new FormData();
    formData.append('file', file);
    fetch(`${API_BASE_URL}/workspace/upload`, { method: 'POST', body: formData })
        .then(r => r.ok ? null : Promise.reject())
        .then(() => { hideDialog(); loadFiles(); showToast('File uploaded'); })
        .catch(() => showToast('Upload failed', 'error'));
}

function showNewFileDialog() {
    document.getElementById('dialog-title').textContent = 'New File';
    document.getElementById('dialog-body').innerHTML = `
        <div class="form-group">
            <label>File Path *</label>
            <input type="text" id="new-file-path" placeholder="e.g., src/utils.js" style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box;">
        </div>
    `;
    document.getElementById('dialog-confirm').textContent = 'Create';
    document.getElementById('dialog-confirm').onclick = createFile;
    document.getElementById('dialog-overlay').classList.add('show');
    document.getElementById('new-file-path').focus();
}

function createFile() {
    const path = document.getElementById('new-file-path').value.trim();
    if (!path) { showToast('Enter a file path', 'error'); return; }
    fetch(`${API_BASE_URL}/workspace/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: '' })
    })
        .then(r => r.ok ? null : Promise.reject())
        .then(() => { hideDialog(); loadFiles(); showToast('File created'); })
        .catch(() => showToast('Failed to create', 'error'));
}

function hideDialog() { document.getElementById('dialog-overlay').classList.remove('show'); }

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : 'xmark'}"></i>${msg}`;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
