const $ = (sel) => document.querySelector(sel);

const editor = $('#editor');
const titleInput = $('#title');
const statusEl = $('#status');
const docList = $('#doc-list');
const blockFormat = $('#block-format');

let currentId = null;
let saveTimer = null;
let dirty = false;

// ---------- API ----------

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// ---------- Sanitizing ----------
// Only a known-safe subset of HTML is kept, both when loading documents and on paste.

const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP',
  'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'CODE', 'UL', 'OL', 'LI', 'A', 'HR', 'FONT',
]);
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'META', 'LINK']);
const ALLOWED_STYLES = ['color', 'background-color', 'text-align', 'margin-left', 'padding-left',
  'font-weight', 'font-style', 'text-decoration', 'text-decoration-line'];

function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  cleanNode(doc.body);
  return doc.body.innerHTML;
}

function cleanNode(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      if (DROP_WITH_CONTENT.has(child.tagName)) {
        child.remove();
        continue;
      }
      cleanNode(child);
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...child.childNodes); // unwrap, keep the text
        continue;
      }
      cleanAttributes(child);
    }
  }
}

function cleanAttributes(el) {
  for (const { name, value } of [...el.attributes]) {
    if (name === 'href' && el.tagName === 'A' && /^(https?:|mailto:|#)/i.test(value.trim())) continue;
    if (name === 'color' && el.tagName === 'FONT') continue;
    if (name === 'style') {
      const kept = ALLOWED_STYLES
        .map((prop) => [prop, el.style.getPropertyValue(prop)])
        .filter(([, v]) => v && !/url\(|expression/i.test(v))
        .map(([prop, v]) => `${prop}: ${v}`)
        .join('; ');
      if (kept) { el.setAttribute('style', kept); continue; }
    }
    el.removeAttribute(name);
  }
  if (el.tagName === 'A') {
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
  }
}

// ---------- Documents ----------

function formatDate(iso) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

async function refreshList() {
  const docs = await api('GET', '/api/docs');
  docList.replaceChildren(...docs.map((doc) => {
    const li = document.createElement('li');
    li.dataset.id = doc.id;
    li.classList.toggle('selected', doc.id === currentId);
    const title = document.createElement('span');
    title.className = 'doc-title';
    title.textContent = doc.title || 'Untitled';
    const date = document.createElement('span');
    date.className = 'doc-date';
    date.textContent = formatDate(doc.updatedAt);
    li.append(title, date);
    li.addEventListener('click', () => openDoc(doc.id));
    return li;
  }));
  return docs;
}

async function openDoc(id) {
  await flushSave();
  const doc = await api('GET', `/api/docs/${id}`);
  currentId = doc.id;
  titleInput.value = doc.title;
  editor.innerHTML = sanitize(doc.content);
  setStatus(`Saved ${formatDate(doc.updatedAt)}`);
  updateCounts();
  for (const li of docList.children) li.classList.toggle('selected', li.dataset.id === id);
  editor.focus();
}

async function newDoc() {
  await flushSave();
  const doc = await api('POST', '/api/docs', { title: '', content: '' });
  currentId = doc.id;
  await refreshList();
  await openDoc(doc.id);
  titleInput.focus();
}

async function deleteDoc() {
  if (!currentId || !confirm(`Delete "${titleInput.value || 'Untitled'}"? This cannot be undone.`)) return;
  clearTimeout(saveTimer);
  dirty = false;
  await api('DELETE', `/api/docs/${currentId}`);
  currentId = null;
  const docs = await refreshList();
  if (docs.length) await openDoc(docs[0].id);
  else await newDoc();
}

// ---------- Saving ----------

function setStatus(text) { statusEl.textContent = text; }

function scheduleSave() {
  dirty = true;
  setStatus('Unsaved changes…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 800);
}

async function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty || !currentId) return;
  dirty = false;
  setStatus('Saving…');
  try {
    const doc = await api('PUT', `/api/docs/${currentId}`, {
      title: titleInput.value.trim(),
      content: editor.innerHTML,
    });
    setStatus(`Saved ${formatDate(doc.updatedAt)}`);
    const li = docList.querySelector(`[data-id="${doc.id}"]`);
    if (li) {
      li.querySelector('.doc-title').textContent = doc.title || 'Untitled';
      li.querySelector('.doc-date').textContent = formatDate(doc.updatedAt);
      docList.prepend(li); // most recently edited first
    }
  } catch (err) {
    dirty = true;
    setStatus('Save failed — retrying…');
    saveTimer = setTimeout(flushSave, 3000);
  }
}

// ---------- Formatting ----------

function exec(cmd, value = null) {
  editor.focus();
  document.execCommand(cmd, false, value);
  updateToolbar();
  scheduleSave();
}

function insertLink() {
  const selection = window.getSelection();
  const url = prompt('Link URL:', 'https://');
  if (!url || url === 'https://') return;
  if (!/^(https?:|mailto:|#)/i.test(url)) return alert('Only http(s), mailto and # links are allowed.');
  if (selection.isCollapsed) {
    const a = document.createElement('a');
    a.href = url;
    a.textContent = url;
    exec('insertHTML', sanitize(a.outerHTML));
  } else {
    exec('createLink', url);
    editor.querySelectorAll('a').forEach(cleanAttributes);
  }
}

const STATE_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList',
  'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight'];

function updateToolbar() {
  if (!editor.contains(window.getSelection().anchorNode)) return;
  for (const cmd of STATE_CMDS) {
    const btn = document.querySelector(`[data-cmd="${cmd}"]`);
    btn.classList.toggle('active', document.queryCommandState(cmd));
  }
  const block = document.queryCommandValue('formatBlock').toLowerCase();
  blockFormat.value = [...blockFormat.options].some((o) => o.value === block) ? block : 'p';
}

function updateCounts() {
  const text = editor.innerText.trim();
  const words = text ? text.split(/\s+/).length : 0;
  $('#counts').textContent = `${words} word${words === 1 ? '' : 's'} · ${text.length} character${text.length === 1 ? '' : 's'}`;
}

// ---------- Wiring ----------

document.execCommand('defaultParagraphSeparator', false, 'p');
document.execCommand('styleWithCSS', false, true);

document.querySelectorAll('[data-cmd]').forEach((btn) => {
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor selection
  btn.addEventListener('click', () => exec(btn.dataset.cmd));
});

$('#link').addEventListener('mousedown', (e) => e.preventDefault());
$('#link').addEventListener('click', insertLink);
blockFormat.addEventListener('change', () => exec('formatBlock', `<${blockFormat.value}>`));
$('#fore-color').addEventListener('input', (e) => exec('foreColor', e.target.value));
$('#hilite-color').addEventListener('input', (e) => exec('hiliteColor', e.target.value));
$('#new-doc').addEventListener('click', newDoc);
$('#delete-doc').addEventListener('click', deleteDoc);

editor.addEventListener('input', () => { updateCounts(); scheduleSave(); });
titleInput.addEventListener('input', scheduleSave);
titleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); editor.focus(); }
});
document.addEventListener('selectionchange', updateToolbar);

editor.addEventListener('paste', (e) => {
  e.preventDefault();
  const html = e.clipboardData.getData('text/html');
  if (html) {
    document.execCommand('insertHTML', false, sanitize(html));
  } else {
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  }
});

editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    insertLink();
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    dirty = true;
    flushSave();
  }
});

// Save any pending edits when the tab is hidden or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) { flushSave(); e.preventDefault(); }
});

(async function init() {
  const docs = await refreshList();
  if (docs.length) await openDoc(docs[0].id);
  else await newDoc();
})();
