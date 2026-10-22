import './style.css';
import 'monaco-editor/esm/nls.messages.tr.js';
import 'monaco-editor/esm/vs/editor/edcore.main.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker&inline';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
import { hydrateIcons, icon } from './icons';
import { sampleOriginal, sampleModified } from './sample';
import { createWorkspace, createWorkspaceRepository } from './workspace';
import type { Workspace, Settings } from './workspace';
import { createUnifiedPatch } from './patch';
import { applyLineChange } from './merge';

type Side = 'original' | 'modified';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escapeHTML = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const repository = createWorkspaceRepository();
const draftResult = repository.loadDraft();
const preferences = repository.loadSettings();
let settings: Settings = preferences.data;
let appliedIgnoreWhitespace = settings.ignoreWhitespace;
let workspace = draftResult.data ?? createWorkspace({ title: 'Portal ayarları · Örnek', original: sampleOriginal, modified: sampleModified, originalName: 'ayarlar.json', modifiedName: 'ayarlar.yeni.json', language: 'json' });
let changes: monaco.editor.ILineChange[] = [];
let currentChange = -1;
let activeSide: Side = 'modified';
let diffPending = true;
let draftTimer: ReturnType<typeof setTimeout>;
let dirty = false;
let changingWorkspace = false;
let storageErrorShown = false;
let selectedDecorations: monaco.editor.IEditorDecorationsCollection[] = [];
const maxFileBytes = 8 * 1024 * 1024;
const modal = $<HTMLDialogElement>('modal');

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.languages.register({ id: 'json' });
monaco.languages.setMonarchTokensProvider('json', {
  tokenizer: { root: [ [/"([^"\\]|\\.)*"\s*(?=:)/, 'key'], [/"([^"\\]|\\.)*"/, 'string'], [/\b(true|false|null)\b/, 'keyword'], [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'], [/[{}\[\]]/, '@brackets'], [/[,:]/, 'delimiter'] ] },
});

function defineThemes() {
  monaco.editor.defineTheme('kiyas-dark', {
    base: 'vs-dark', inherit: true,
    rules: [ { token: 'key', foreground: 'ABBEDB' }, { token: 'string', foreground: 'B5CEA8' }, { token: 'number', foreground: 'D6B98C' }, { token: 'keyword', foreground: 'C3A6DB' } ],
    colors: {
      'editor.background': '#15191f', 'editor.foreground': '#c4cedb', 'editorLineNumber.foreground': '#536071',
      'editorLineNumber.activeForeground': '#bdcbd8', 'editor.lineHighlightBackground': '#ffffff04',
      'editor.selectionBackground': '#357d9e55', 'editor.inactiveSelectionBackground': '#357d9e25',
      'editorIndentGuide.background1': '#ffffff09', 'editorIndentGuide.activeBackground1': '#ffffff18',
      'editorGutter.background': '#15191f', 'diffEditor.insertedTextBackground': '#39c68b28',
      'diffEditor.removedTextBackground': '#f071782b', 'diffEditor.insertedLineBackground': '#39c68b0c',
      'diffEditor.removedLineBackground': '#f0717810', 'diffEditor.diagonalFill': '#ffffff08',
      'diffEditor.border': '#2b333f', 'diffEditorOverview.insertedForeground': '#3dbf8b',
      'diffEditorOverview.removedForeground': '#db7280', 'scrollbarSlider.background': '#72809630',
      'scrollbarSlider.hoverBackground': '#72809655', 'editorWidget.background': '#1d242e',
      'editorWidget.border': '#384455', 'focusBorder': '#40cea1',
    },
  });
  monaco.editor.defineTheme('kiyas-light', {
    base: 'vs', inherit: true,
    rules: [ { token: 'key', foreground: '345276' }, { token: 'string', foreground: '397653' } ],
    colors: { 'editor.background': '#ffffff', 'editor.foreground': '#334155', 'editorGutter.background': '#ffffff', 'editorLineNumber.foreground': '#94a3b8', 'editor.lineHighlightBackground': '#f5f7f9', 'diffEditor.insertedTextBackground': '#22b47726', 'diffEditor.removedTextBackground': '#e45f6a29', 'diffEditor.insertedLineBackground': '#22b4770c', 'diffEditor.removedLineBackground': '#e45f6a0c', 'diffEditor.diagonalFill': '#64748b0d', 'diffEditor.border': '#e2e8f0', 'focusBorder': '#16825e' },
  });
}
defineThemes();
document.documentElement.dataset.theme = settings.theme;
hydrateIcons();

const originalModel = monaco.editor.createModel(workspace.original, workspace.language);
const modifiedModel = monaco.editor.createModel(workspace.modified, workspace.language);
const diffEditor = monaco.editor.createDiffEditor($('diff-editor'), {
  theme: `kiyas-${settings.theme}`, originalEditable: true, readOnly: false,
  automaticLayout: true, renderSideBySide: settings.renderSideBySide,
  enableSplitViewResizing: true, splitViewDefaultRatio: 0.5,
  useInlineViewWhenSpaceIsLimited: false, diffAlgorithm: 'advanced',
  ignoreTrimWhitespace: settings.ignoreWhitespace,
  hideUnchangedRegions: { enabled: settings.hideUnchanged, contextLineCount: 3, minimumLineCount: 6, revealLineCount: 10 },
  renderMarginRevertIcon: false, renderGutterMenu: false,
  maxComputationTime: 10000, maxFileSize: 16,
  fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace", fontSize: settings.fontSize,
  lineHeight: 23, fontLigatures: false, minimap: { enabled: false },
  padding: { top: 18, bottom: 18 }, scrollBeyondLastLine: false,
  wordWrap: settings.wordWrap ? 'on' : 'off', diffWordWrap: settings.wordWrap ? 'on' : 'off',
  smoothScrolling: true, cursorSmoothCaretAnimation: 'off',
  bracketPairColorization: { enabled: false }, renderWhitespace: 'selection',
  folding: true, lineNumbersMinChars: 4, glyphMargin: false,
  overviewRulerBorder: false, renderOverviewRuler: true,
  unicodeHighlight: { ambiguousCharacters: false },
  accessibilitySupport: 'auto', originalAriaLabel: 'Orijinal metin, sol editör', modifiedAriaLabel: 'Değiştirilmiş metin, sağ editör',
});
diffEditor.setModel({ original: originalModel, modified: modifiedModel });
selectedDecorations = [diffEditor.getOriginalEditor().createDecorationsCollection(), diffEditor.getModifiedEditor().createDecorationsCollection()];
$('editor-loading').remove();

function toast(message: string, error = false) {
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.innerHTML = `${icon(error ? 'help' : 'check')}<span>${escapeHTML(message)}</span>`;
  $('toasts').append(item);
  setTimeout(() => item.remove(), error ? 6500 : 3600);
}
function readWorkspace(): Workspace {
  return { ...workspace, original: originalModel.getValue(), modified: modifiedModel.getValue(), originalName: $<HTMLInputElement>('original-name').value.trim() || 'orijinal.txt', modifiedName: $<HTMLInputElement>('modified-name').value.trim() || 'degistirilmis.txt', language: originalModel.getLanguageId(), updatedAt: Date.now() };
}
function saveDraft() {
  clearTimeout(draftTimer);
  workspace = readWorkspace();
  const result = repository.saveDraft(workspace);
  $('save-status').innerHTML = `${result.ok ? '<span class="local-indicator"></span>' : icon('help')}${result.ok ? 'Taslak kaydedildi' : 'Taslak kaydedilemedi'}`;
  dirty = !result.ok;
  if (!result.ok && !storageErrorShown) { toast(result.error, true); storageErrorShown = true; }
}
function markDirty() {
  if (changingWorkspace) return;
  dirty = true;
  $('save-status').innerHTML = '<span class="local-indicator pending"></span>Kaydediliyor…';
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 650);
}
function updateMeta() {
  for (const side of ['original', 'modified'] as const) {
    const model = side === 'original' ? originalModel : modifiedModel;
    $(`${side}-meta`).textContent = `${model.getLineCount().toLocaleString('tr-TR')} satır · ${model.getValueLength().toLocaleString('tr-TR')} karakter`;
  }
}
function markDiffPending() {
  diffPending = true;
  $('diff-status').textContent = 'Değişiklikler hesaplanıyor…';
  $('diff-status-dot').classList.add('pending');
  updateMergeButtons();
  updateMeta();
  markDirty();
}
originalModel.onDidChangeContent(markDiffPending);
modifiedModel.onDidChangeContent(markDiffPending);

function updateMergeButtons() {
  for (const id of ['merge-left', 'merge-right', 'previous-change', 'next-change']) $<HTMLButtonElement>(id).disabled = diffPending || changes.length === 0;
}
function changeLine(change: monaco.editor.ILineChange, side: Side): number {
  return Math.max(1, side === 'original' ? change.originalStartLineNumber : change.modifiedStartLineNumber);
}
function renderSelection(reveal = false) {
  const change = changes[currentChange];
  $('navigation-count').textContent = changes.length ? `${currentChange + 1} / ${changes.length} değişiklik` : '0 değişiklik';
  document.querySelectorAll<HTMLButtonElement>('.change-item').forEach((item, index) => {
    item.classList.toggle('selected', index === currentChange);
    item.setAttribute('aria-current', index === currentChange ? 'true' : 'false');
  });
  if (!change) { selectedDecorations.forEach(value => value.clear()); return; }
  (['original', 'modified'] as const).forEach((side, i) => {
    const line = changeLine(change, side);
    const end = Math.max(line, side === 'original' ? change.originalEndLineNumber : change.modifiedEndLineNumber);
    selectedDecorations[i].set([{ range: new monaco.Range(line, 1, end, 1), options: { isWholeLine: true, linesDecorationsClassName: 'active-diff-decoration' } }]);
  });
  if (reveal) {
    diffEditor.getOriginalEditor().revealLineInCenter(changeLine(change, 'original'), monaco.editor.ScrollType.Smooth);
    diffEditor.getModifiedEditor().revealLineInCenter(changeLine(change, 'modified'), monaco.editor.ScrollType.Smooth);
    $('change-list').querySelector('.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
function goToChange(direction: number) {
  if (diffPending || !changes.length) return;
  currentChange = (currentChange + direction + changes.length) % changes.length;
  renderSelection(true);
}
function renderChanges() {
  let added = 0;
  let removed = 0;
  $('change-list').innerHTML = changes.slice(0, 500).map((change, index) => {
    const add = change.modifiedEndLineNumber ? change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1 : 0;
    const remove = change.originalEndLineNumber ? change.originalEndLineNumber - change.originalStartLineNumber + 1 : 0;
    added += add; removed += remove;
    const type = add && remove ? 'changed' : add ? 'added' : 'removed';
    const label = type === 'changed' ? 'Değiştirildi' : type === 'added' ? 'Eklendi' : 'Silindi';
    const model = add ? modifiedModel : originalModel;
    const line = Math.max(1, add ? change.modifiedStartLineNumber : change.originalStartLineNumber);
    const preview = model.getLineContent(Math.min(line, model.getLineCount())).trim().slice(0, 100) || '(boş satır)';
    return `<button class="change-item ${type}" data-change="${index}" title="${escapeHTML(preview)}"><span class="change-number">${String(index + 1).padStart(2, '0')}</span><span class="change-type ${type}">${label}</span><span class="change-location">${add ? 'Sağ' : 'Sol'} · ${line}. satır</span><code class="change-preview">${escapeHTML(preview)}</code><span class="change-line-count"><span class="added">${add ? `+${add}` : ''}</span><span class="removed">${remove ? `−${remove}` : ''}</span></span>${icon('arrow-right')}</button>`;
  }).join('');
  // Totals include all hunks, including ones beyond the rendered list limit.
  for (const change of changes.slice(500)) {
    added += change.modifiedEndLineNumber ? change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1 : 0;
    removed += change.originalEndLineNumber ? change.originalEndLineNumber - change.originalStartLineNumber + 1 : 0;
  }
  if (!changes.length) {
    const blank = !originalModel.getValueLength() && !modifiedModel.getValueLength();
    $('change-list').innerHTML = `<div class="change-empty">${icon(blank ? 'clipboard' : 'check')}<span>${blank ? 'Metinlerini yapıştır veya dosyalarını bırak. Karşılaştırma otomatik başlar.' : 'Her şey aynı. Bu seçeneklere göre iki metin arasında fark yok.'}</span></div>`;
  } else if (changes.length > 500) {
    $('change-list').insertAdjacentHTML('beforeend', '<div class="change-empty">İlk 500 değişiklik listeleniyor. Tüm değişikliklere klavyeyle ulaşabilirsin.</div>');
  }
  $('changes-count').textContent = String(changes.length);
  $('added-count').textContent = `+${added} eklenen`;
  $('removed-count').textContent = `−${removed} silinen`;
  $('diff-status').textContent = changes.length ? `${changes.length} değişiklik bulundu` : 'Metinler aynı';
  $('diff-status-dot').classList.remove('pending');
  updateMergeButtons();
  renderSelection();
}
diffEditor.onDidUpdateDiff(() => {
  const result = diffEditor.getLineChanges();
  diffPending = result === null;
  if (diffPending) return;
  changes = result ?? [];
  currentChange = changes.length ? Math.min(Math.max(currentChange, 0), changes.length - 1) : -1;
  renderChanges();
});

function applySettings(persist = true) {
  document.documentElement.dataset.theme = settings.theme;
  monaco.editor.setTheme(`kiyas-${settings.theme}`);
  if (appliedIgnoreWhitespace !== settings.ignoreWhitespace) {
    appliedIgnoreWhitespace = settings.ignoreWhitespace;
    diffPending = true;
    $('diff-status').textContent = 'Değişiklikler hesaplanıyor…';
    updateMergeButtons();
  }
  diffEditor.updateOptions({
    renderSideBySide: settings.renderSideBySide, fontSize: settings.fontSize,
    wordWrap: settings.wordWrap ? 'on' : 'off', diffWordWrap: settings.wordWrap ? 'on' : 'off',
    ignoreTrimWhitespace: settings.ignoreWhitespace,
    hideUnchangedRegions: { enabled: settings.hideUnchanged, contextLineCount: 3, minimumLineCount: 6, revealLineCount: 10 },
  });
  for (const [id, pressed] of Object.entries({ 'view-split': settings.renderSideBySide, 'view-inline': !settings.renderSideBySide, 'ignore-whitespace': settings.ignoreWhitespace, 'word-wrap': settings.wordWrap, 'hide-unchanged': settings.hideUnchanged })) {
    $(id).classList.toggle('active', pressed);
    $(id).setAttribute('aria-pressed', String(pressed));
  }
  $('theme-toggle').innerHTML = icon(settings.theme === 'dark' ? 'sun' : 'moon');
  $('theme-toggle').setAttribute('aria-label', settings.theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç');
  if (persist) { const result = repository.saveSettings(settings); if (!result.ok) toast(result.error, true); }
}
function setLanguage(language: string) {
  if (!Array.from($<HTMLSelectElement>('language-select').options).some(option => option.value === language)) language = 'plaintext';
  monaco.editor.setModelLanguage(originalModel, language);
  monaco.editor.setModelLanguage(modifiedModel, language);
  $<HTMLSelectElement>('language-select').value = language;
}
function guessLanguage(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return ({ json: 'json', js: 'javascript', mjs: 'javascript', ts: 'typescript', html: 'html', htm: 'html', asp: 'html', aspx: 'html', css: 'css', sql: 'sql', cs: 'csharp', xml: 'xml', config: 'xml', md: 'markdown', py: 'python', yaml: 'yaml', yml: 'yaml' } as Record<string, string>)[extension] ?? 'plaintext';
}
function loadWorkspace(value: Workspace) {
  saveDraft();
  changingWorkspace = true;
  workspace = { ...value };
  originalModel.setValue(value.original);
  modifiedModel.setValue(value.modified);
  $<HTMLInputElement>('original-name').value = value.originalName;
  $<HTMLInputElement>('modified-name').value = value.modifiedName;
  setLanguage(value.language);
  currentChange = -1;
  changingWorkspace = false;
  updateMeta();
  saveDraft();
}
function openModal(title: string, html: string, eyebrow = 'KIYAS ÇALIŞMA ALANI') {
  $('modal-title').textContent = title;
  $('modal-eyebrow').textContent = eyebrow;
  $('modal-body').innerHTML = html;
  hydrateIcons($('modal-body'));
  if (!modal.open) modal.showModal();
}
function confirmAction(title: string, description: string, action: () => void, label = 'Devam et') {
  openModal(title, `<p class="modal-description">${escapeHTML(description)}</p><div class="form-actions"><button class="button secondary" id="cancel-action">Vazgeç</button><button class="button primary" id="confirm-action">${escapeHTML(label)}</button></div>`);
  $('cancel-action').onclick = () => modal.close();
  $('confirm-action').onclick = () => { modal.close(); action(); };
}
function newWorkspace() {
  const open = () => { loadWorkspace(createWorkspace()); toast('Yeni karşılaştırma hazır.'); diffEditor.getOriginalEditor().focus(); };
  if (originalModel.getValueLength() || modifiedModel.getValueLength()) confirmAction('Yeni bir karşılaştırma aç', 'Mevcut metinlerin yerini boş bir çalışma alacak. Saklamak için önce “Çalışmayı kaydet” düğmesini veya dışa aktarmayı kullan.', open, 'Yeni karşılaştırma aç');
  else open();
}
function showSaveModal() {
  openModal('Çalışmanı kaydet', `<p class="modal-description">İki metin birlikte bu tarayıcıda saklanır. Son 20 çalışmana istediğin zaman geri dönebilirsin.</p><form id="save-form"><label class="field" for="workspace-title">Çalışma adı<input class="form-input" id="workspace-title" maxlength="100" required value="${escapeHTML(workspace.title)}" placeholder="Örn. Canlı ortam ayarları"></label><div class="form-actions"><button class="button secondary" type="button" id="cancel-save">Vazgeç</button><button class="button primary" type="submit">${icon('bookmark')}Kaydet</button></div></form>`);
  $('cancel-save').onclick = () => modal.close();
  $('save-form').onsubmit = event => {
    event.preventDefault();
    const title = $<HTMLInputElement>('workspace-title').value.trim();
    if (!title) return;
    workspace = { ...readWorkspace(), title };
    const result = repository.saveWorkspace(workspace);
    if (!result.ok) { toast(result.error, true); return; }
    saveDraft(); renderRecent(); modal.close(); toast('Çalışma kaydedildi.');
  };
  requestAnimationFrame(() => { $<HTMLInputElement>('workspace-title').focus(); $<HTMLInputElement>('workspace-title').select(); });
}
const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function renderRecent() {
  const result = repository.loadWorkspaces();
  $('saved-count').textContent = String(result.data.length);
  $('recent-sessions').innerHTML = result.data.slice(0, 6).map(session => `<button class="recent-session" data-session="${escapeHTML(session.id)}">${icon('file')}<span><span class="session-title">${escapeHTML(session.title)}</span><span class="session-time">${dateFormat.format(session.updatedAt)}</span></span></button>`).join('') || '<div class="recent-empty">Çalışmanı kaydet;<br>bir sonraki sefer burada bul.</div>';
}
function openSaved(id: string) {
  const session = repository.loadWorkspaces().data.find(value => value.id === id);
  if (!session) return;
  const open = () => { loadWorkspace(session); modal.close(); toast(`“${session.title}” açıldı.`); };
  const current = readWorkspace();
  const savedCurrent = repository.loadWorkspaces().data.find(value => value.id === current.id);
  const fields = ['original', 'modified', 'originalName', 'modifiedName', 'language'] as const;
  if ((current.original || current.modified) && (!savedCurrent || fields.some(key => savedCurrent[key] !== current[key]))) {
    confirmAction('Kayıtlı çalışmayı aç', 'Açacağın çalışma mevcut metinlerin yerini alacak. Mevcut çalışmanı saklamak için önce kaydet veya dışa aktar.', open, 'Çalışmayı aç');
  } else open();
}
function showSessions() {
  const sessions = repository.loadWorkspaces();
  openModal('Kayıtlı çalışmalar', `<p class="modal-description">Bu tarayıcıda ${sessions.data.length} / 20 çalışma kayıtlı. Açmadan önce mevcut çalışmanı kaydedebilirsin.</p><div class="session-list">${sessions.data.map(session => `<div class="session-row"><span class="session-file-icon">${icon('file')}</span><div class="session-copy"><strong>${escapeHTML(session.title)}</strong><span>${escapeHTML(session.originalName)} ↔ ${escapeHTML(session.modifiedName)}</span><small>${dateFormat.format(session.updatedAt)}</small></div><div class="session-actions"><button class="button compact secondary" data-open-session="${escapeHTML(session.id)}">Aç</button><button class="icon-button" data-delete-session="${escapeHTML(session.id)}" aria-label="${escapeHTML(session.title)} çalışmasını sil" title="Çalışmayı sil">${icon('trash')}</button></div></div>`).join('') || `<div class="empty-state">${icon('bookmark')}<strong>Henüz kayıtlı bir çalışma yok.</strong><p>İki metnini “Çalışmayı kaydet” düğmesiyle birlikte saklayabilirsin.</p></div>`}</div><div class="form-actions"><button class="button secondary" id="import-from-library">${icon('upload')}Yedek içe aktar</button><button class="button primary" id="save-from-library">Mevcut çalışmayı kaydet</button></div>`);
  if (!sessions.ok) toast(sessions.error, true);
  document.querySelectorAll<HTMLElement>('[data-open-session]').forEach(button => button.onclick = () => openSaved(button.dataset.openSession!));
  document.querySelectorAll<HTMLElement>('[data-delete-session]').forEach(button => button.onclick = () => {
    const id = button.dataset.deleteSession!;
    confirmAction('Kayıtlı çalışmayı sil', 'Bu kayıt bu tarayıcıdan kaldırılacak. Şu anda editörde açık olan metinler etkilenmez.', () => {
      const result = repository.removeWorkspace(id);
      if (!result.ok) toast(result.error, true); else toast('Kayıt silindi.');
      renderRecent(); showSessions();
    }, 'Kaydı sil');
  });
  $('import-from-library').onclick = () => $<HTMLInputElement>('import-input').click();
  $('save-from-library').onclick = showSaveModal;
}
function showShortcuts() {
  const shortcuts = [ ['Alt + ↓', 'Sonraki değişiklik'], ['Alt + ↑', 'Önceki değişiklik'], ['F7 / Shift + F7', 'Sonraki / önceki değişiklik'], ['↓ / ↑', 'Editör dışında farklar arasında gezin'], ['Ctrl + F', 'Odaktaki metinde ara'], ['Ctrl + H', 'Odaktaki metinde bul ve değiştir'], ['Ctrl + Z / Ctrl + Y', 'Geri al / yinele'], ['Ctrl + S', 'Odaktaki metni dosya olarak indir'], ['Ctrl + Alt + S', 'Çalışmayı kaydet'], ['Alt + N', 'Yeni karşılaştırma'], ['Ctrl + + / −', 'Editör yazısını büyüt / küçült'] ];
  openModal('Klavyeyle daha hızlı', `<p class="modal-description">Metin yazarken normal ok tuşları imleci hareket ettirir. Farklara atlamak için Alt + ok tuşlarını kullan.</p><div class="shortcut-list">${shortcuts.map(([keys, description]) => `<div class="shortcut-row"><span>${description}</span><kbd>${keys}</kbd></div>`).join('')}</div><p class="modal-note">İpucu: Dosyaları doğrudan sol veya sağ editörün üzerine sürükleyebilirsin. İki dosyayı birlikte bırakırsan her biri bir tarafa açılır.</p>`, 'KISAYOLLAR & İPUÇLARI');
}
function showSettings() {
  openModal('Kendine göre ayarla', `<div class="setting-row"><div class="setting-copy"><strong>Görünüm</strong><span>Gözlerine en rahat gelen temayı seç.</span></div><select class="form-input" id="setting-theme"><option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Koyu tema</option><option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Açık tema</option></select></div><div class="setting-row"><div class="setting-copy"><strong>Yazı boyutu</strong><span>Metin ve kod editörünün yazı boyutu.</span></div><select class="form-input" id="setting-font">${Array.from({ length: 14 }, (_, i) => i + 11).map(size => `<option value="${size}" ${settings.fontSize === size ? 'selected' : ''}>${size} px</option>`).join('')}</select></div><div class="setting-row"><div class="setting-copy"><strong>Boşlukları yoksay</strong><span>Satır başı ve sonundaki boşluk farklarını gizle.</span></div><label class="toggle"><input type="checkbox" id="setting-whitespace" aria-label="Boşlukları yoksay" ${settings.ignoreWhitespace ? 'checked' : ''}><span></span></label></div><div class="setting-row"><div class="setting-copy"><strong>Satır kaydır</strong><span>Uzun satırlar editör genişliğine sığsın.</span></div><label class="toggle"><input type="checkbox" id="setting-wrap" aria-label="Satır kaydır" ${settings.wordWrap ? 'checked' : ''}><span></span></label></div><div class="settings-note">${icon('shield')}<span>Metinlerin bu tarayıcının yerel alanında saklanır. Saklamak istediğin çalışmalar için dosya yedeği alabilirsin.</span></div><div class="setting-row danger-zone"><div class="setting-copy"><strong>Mevcut taslağı temizle</strong><span>İki editörü boşaltır. Kayıtlı çalışmalar korunur.</span></div><button class="button danger compact" id="clear-draft">${icon('trash')}Temizle</button></div>`);
  $<HTMLSelectElement>('setting-theme').onchange = event => { settings.theme = (event.target as HTMLSelectElement).value as Settings['theme']; applySettings(); };
  $<HTMLSelectElement>('setting-font').onchange = event => { settings.fontSize = Number((event.target as HTMLSelectElement).value); applySettings(); };
  $<HTMLInputElement>('setting-whitespace').onchange = event => { settings.ignoreWhitespace = (event.target as HTMLInputElement).checked; applySettings(); };
  $<HTMLInputElement>('setting-wrap').onchange = event => { settings.wordWrap = (event.target as HTMLInputElement).checked; applySettings(); };
  $('clear-draft').onclick = () => confirmAction('Mevcut taslağı temizle', 'Sol ve sağ metindeki tüm içerik temizlenecek. Kayıtlı çalışmaların korunur.', () => { loadWorkspace(createWorkspace()); toast('Taslak temizlendi.'); }, 'Taslağı temizle');
}
function download(contents: string, name: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'metin.txt';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData(kind: string) {
  const current = readWorkspace();
  if (kind === 'original' || kind === 'modified') download(current[kind], current[`${kind}Name`]);
  else if (kind === 'patch') download(createUnifiedPatch(current.original, current.modified, current.originalName, current.modifiedName), 'degisiklikler.patch', 'text/x-diff;charset=utf-8');
  else if (kind === 'session') download(JSON.stringify({ format: 'kiyas-workspace', version: 1, workspace: current }, null, 2), `${current.title}.kiyas.json`, 'application/json');
  $('export-menu').hidden = true;
  $('export-button').setAttribute('aria-expanded', 'false');
}
async function readTextFile(file: File): Promise<string> {
  if (file.size > maxFileBytes) throw new Error('Dosya en fazla 8 MB olabilir. Daha küçük bir metin dosyası seç.');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le', { fatal: true }).decode(buffer);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be', { fatal: true }).decode(buffer);
  else {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new Error('Bu dosya UTF-8 veya UTF-16 metin olarak okunamadı. Dosyayı UTF-8 kaydedip yeniden aç.'); }
  }
  if (text.includes('\0')) throw new Error('Bu dosya bir metin dosyası gibi görünmüyor. Metin veya kod dosyası seç.');
  return text;
}
async function loadFiles(files: File[], side: Side) {
  if (!files.length) return;
  try {
    const selected = files.slice(0, 2);
    const texts = await Promise.all(selected.map(readTextFile));
    selected.forEach((file, index) => {
      const targetSide = selected.length === 2 ? index === 0 ? 'original' : 'modified' : side;
      const model = targetSide === 'original' ? originalModel : modifiedModel;
      const editor = targetSide === 'original' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
      editor.pushUndoStop(); editor.executeEdits('open-file', [{ range: model.getFullModelRange(), text: texts[index] }]); editor.pushUndoStop();
      $<HTMLInputElement>(`${targetSide}-name`).value = file.name;
      setLanguage(guessLanguage(file.name));
    });
    markDirty();
    toast(selected.length === 2 ? 'İki dosya karşılaştırma için açıldı.' : `“${selected[0].name}” açıldı.`);
    if (files.length > 2) toast('İlk iki dosya açıldı. Aynı anda iki dosya karşılaştırabilirsin.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Dosya okunamadı.', true); }
}
async function fileAction(action: string, side: Side) {
  const model = side === 'original' ? originalModel : modifiedModel;
  const editor = side === 'original' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
  if (action === 'open') { activeSide = side; $<HTMLInputElement>('file-input').click(); }
  else if (action === 'copy') {
    try { await navigator.clipboard.writeText(model.getValue()); toast('Metin panoya kopyalandı.'); }
    catch { toast('Panoya erişilemedi. Editörde Ctrl+A ve Ctrl+C kullanabilirsin.', true); }
  } else if (action === 'paste') {
    try {
      const text = await navigator.clipboard.readText();
      if (text.length > maxFileBytes) throw new Error('Panodaki metin çok büyük. En fazla 8 MB kullanabilirsin.');
      editor.pushUndoStop(); editor.executeEdits('paste-all', [{ range: model.getFullModelRange(), text }]); editor.pushUndoStop(); editor.focus();
      toast('Panodaki metin açıldı.');
    } catch (error) { toast(error instanceof Error && error.message.includes('büyük') ? error.message : 'Panoya erişilemedi. Editöre tıklayıp Ctrl+V kullanabilirsin.', true); editor.focus(); }
  }
}
function merge(direction: 'left' | 'right') {
  if (diffPending || !changes[currentChange]) return;
  const change = changes[currentChange];
  const value = applyLineChange(originalModel.getValue(), modifiedModel.getValue(), change, direction);
  const editor = direction === 'right' ? diffEditor.getModifiedEditor() : diffEditor.getOriginalEditor();
  const model = direction === 'right' ? modifiedModel : originalModel;
  const line = Math.min(changeLine(change, direction === 'right' ? 'modified' : 'original'), value.split(/\r\n|\r|\n/).length);
  editor.pushUndoStop(); editor.executeEdits('merge-change', [{ range: model.getFullModelRange(), text: value }], [new monaco.Selection(line, 1, line, 1)]); editor.pushUndoStop();
  editor.focus(); editor.revealLineInCenter(line);
  toast(`Değişiklik ${direction === 'right' ? 'sağa' : 'sola'} aktarıldı. Ctrl+Z ile geri alabilirsin.`);
}

$('previous-change').onclick = () => goToChange(-1);
$('next-change').onclick = () => goToChange(1);
$('merge-left').onclick = () => merge('left');
$('merge-right').onclick = () => merge('right');
$('new-workspace').onclick = newWorkspace;
$('save-workspace').onclick = showSaveModal;
$('sessions-nav').onclick = showSessions;
$('refresh-sessions').onclick = showSessions;
$('compare-nav').onclick = () => { modal.close(); diffEditor.getModifiedEditor().focus(); };
$('help-button').onclick = showShortcuts;
$('shortcuts-sidebar').onclick = showShortcuts;
$('settings-button').onclick = showSettings;
$('close-modal').onclick = () => modal.close();
modal.addEventListener('click', event => { if (event.target === modal) { const bounds = modal.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) modal.close(); } });
$('theme-toggle').onclick = () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applySettings(); };
$('view-split').onclick = () => { settings.renderSideBySide = true; applySettings(); };
$('view-inline').onclick = () => { settings.renderSideBySide = false; applySettings(); };
$('ignore-whitespace').onclick = () => { settings.ignoreWhitespace = !settings.ignoreWhitespace; applySettings(); };
$('word-wrap').onclick = () => { settings.wordWrap = !settings.wordWrap; applySettings(); };
$('hide-unchanged').onclick = () => { settings.hideUnchanged = !settings.hideUnchanged; applySettings(); };
$('language-select').onchange = event => { setLanguage((event.target as HTMLSelectElement).value); markDirty(); };
$('change-list').onclick = event => { const item = (event.target as HTMLElement).closest<HTMLElement>('[data-change]'); if (item) { currentChange = Number(item.dataset.change); renderSelection(true); } };
$('recent-sessions').onclick = event => { const item = (event.target as HTMLElement).closest<HTMLElement>('[data-session]'); if (item) openSaved(item.dataset.session!); };
$('toggle-changes').onclick = () => { const list = $('change-list'); list.hidden = !list.hidden; $('toggle-changes').setAttribute('aria-expanded', String(!list.hidden)); $('change-tray').classList.toggle('collapsed', list.hidden); };
$('export-button').onclick = () => { const menu = $('export-menu'); menu.hidden = !menu.hidden; $('export-button').setAttribute('aria-expanded', String(!menu.hidden)); };
document.addEventListener('click', event => { if (!(event.target as HTMLElement).closest('.dropdown')) { $('export-menu').hidden = true; $('export-button').setAttribute('aria-expanded', 'false'); } });
document.querySelectorAll<HTMLElement>('[data-export]').forEach(button => button.onclick = () => exportData(button.dataset.export!));
document.querySelectorAll<HTMLElement>('[data-action][data-side]').forEach(button => button.onclick = () => { void fileAction(button.dataset.action!, button.dataset.side as Side); });
$('original-name').oninput = markDirty;
$('modified-name').oninput = markDirty;
$<HTMLInputElement>('file-input').onchange = event => { const input = event.target as HTMLInputElement; void loadFiles(Array.from(input.files ?? []), activeSide); input.value = ''; };
$('swap-texts').onclick = () => {
  const before = readWorkspace();
  // Each pane keeps a proper undo boundary, including when one side is empty.
  for (const [editor, model, text] of [[diffEditor.getOriginalEditor(), originalModel, before.modified], [diffEditor.getModifiedEditor(), modifiedModel, before.original]] as const) {
    editor.pushUndoStop(); editor.executeEdits('swap-texts', [{ range: model.getFullModelRange(), text }]); editor.pushUndoStop();
  }
  $<HTMLInputElement>('original-name').value = before.modifiedName;
  $<HTMLInputElement>('modified-name').value = before.originalName;
  markDirty(); toast('Sol ve sağ metinlerin yeri değiştirildi.');
};
$('load-example').onclick = () => confirmAction('Örnek karşılaştırmayı aç', 'Örnek metinler mevcut metinlerin yerini alacak. Saklamak istediğin çalışmanı önce kaydet.', () => { loadWorkspace(createWorkspace({ title: 'Portal ayarları · Örnek', original: sampleOriginal, modified: sampleModified, originalName: 'ayarlar.json', modifiedName: 'ayarlar.yeni.json', language: 'json' })); toast('Örnek karşılaştırma açıldı.'); }, 'Örneği aç');
$('import-workspace').onclick = () => $<HTMLInputElement>('import-input').click();
$<HTMLInputElement>('import-input').onchange = async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('Yedek dosyası en fazla 20 MB olabilir.');
    const data: unknown = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !('format' in data) || data.format !== 'kiyas-workspace' || !('version' in data) || data.version !== 1 || !('workspace' in data)) throw new Error('Geçerli bir Kıyas yedek dosyası seç.');
    const value = data.workspace as Partial<Workspace>;
    if (!value || typeof value.original !== 'string' || typeof value.modified !== 'string' || typeof value.title !== 'string' || typeof value.originalName !== 'string' || typeof value.modifiedName !== 'string' || typeof value.language !== 'string') throw new Error('Yedekteki çalışma bilgileri eksik veya geçersiz.');
    const imported = createWorkspace({ title: value.title.trim() || 'İçe aktarılan çalışma', original: value.original, modified: value.modified, originalName: value.originalName, modifiedName: value.modifiedName, language: value.language });
    confirmAction('Yedeği içe aktar', 'Yedekteki iki metin mevcut editörlerin yerini alacak. Saklamak istediğin mevcut çalışmanı önce kaydet.', () => { loadWorkspace(imported); toast('Yedek içe aktarıldı. Kalıcı saklamak için çalışmayı kaydedebilirsin.'); }, 'Yedeği aç');
  } catch (error) { toast(error instanceof SyntaxError ? 'Yedek dosyası geçerli JSON içermiyor.' : error instanceof Error ? error.message : 'Yedek okunamadı.', true); }
};

for (const [side, editor] of [['original', diffEditor.getOriginalEditor()], ['modified', diffEditor.getModifiedEditor()]] as const) {
  editor.onDidFocusEditorText(() => { activeSide = side; });
  editor.onDidChangeCursorPosition(event => {
    activeSide = side;
    $('cursor-position').textContent = `Satır ${event.position.lineNumber}, Sütun ${event.position.column}`;
    if (diffPending) return;
    const index = changes.findIndex(change => {
      const start = side === 'original' ? change.originalStartLineNumber : change.modifiedStartLineNumber;
      const end = side === 'original' ? change.originalEndLineNumber : change.modifiedEndLineNumber;
      return end > 0 && event.position.lineNumber >= start && event.position.lineNumber <= end;
    });
    if (index >= 0 && index !== currentChange) { currentChange = index; renderSelection(); }
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { $('export-menu').hidden = true; $('export-button').setAttribute('aria-expanded', 'false'); }
  if (modal.open) return;
  const target = event.target as HTMLElement;
  const typing = target.matches('input, textarea, select, [contenteditable="true"]') || !!target.closest('.monaco-editor');
  if ((event.altKey && ['ArrowDown', 'ArrowUp'].includes(event.key)) || event.key === 'F7' || (!typing && !event.ctrlKey && !event.metaKey && ['ArrowDown', 'ArrowUp'].includes(event.key))) {
    event.preventDefault(); event.stopPropagation();
    goToChange(event.key === 'ArrowUp' || (event.key === 'F7' && event.shiftKey) ? -1 : 1);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault(); event.stopPropagation();
    if (event.altKey) showSaveModal(); else exportData(activeSide);
  } else if (event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); newWorkspace(); }
  else if ((event.ctrlKey || event.metaKey) && ['+', '=', '-'].includes(event.key)) {
    event.preventDefault(); event.stopPropagation();
    settings.fontSize = Math.max(11, Math.min(24, settings.fontSize + (event.key === '-' ? -1 : 1))); applySettings();
  }
}, { capture: true });

const stage = $('editor-stage');
let dragDepth = 0;
function sideAtPosition(x: number): Side { const bounds = stage.getBoundingClientRect(); return x < bounds.left + bounds.width / 2 ? 'original' : 'modified'; }
stage.addEventListener('dragenter', event => { if (!event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); dragDepth++; $('drop-overlay').hidden = false; });
stage.addEventListener('dragover', event => { if (!event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; $('drop-side-label').textContent = event.dataTransfer.items.length > 1 ? 'İki dosyayı yan yana karşılaştır' : `${sideAtPosition(event.clientX) === 'original' ? 'Sol' : 'Sağ'} metin olarak aç`; });
stage.addEventListener('dragleave', event => { event.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').hidden = true; } });
stage.addEventListener('drop', event => { if (!event.dataTransfer?.files.length) return; event.preventDefault(); event.stopPropagation(); dragDepth = 0; $('drop-overlay').hidden = true; void loadFiles(Array.from(event.dataTransfer.files), sideAtPosition(event.clientX)); });
window.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
window.addEventListener('drop', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
window.addEventListener('pagehide', () => { if (dirty) saveDraft(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) saveDraft(); });
window.addEventListener('beforeunload', event => { if (dirty) saveDraft(); if (dirty) { event.preventDefault(); event.returnValue = ''; } });

$<HTMLInputElement>('original-name').value = workspace.originalName;
$<HTMLInputElement>('modified-name').value = workspace.modifiedName;
setLanguage(workspace.language);
applySettings(false);
renderRecent(); updateMeta(); updateMergeButtons();
if (!draftResult.ok) toast(draftResult.error, true);
if (!preferences.ok) toast(preferences.error, true);
if (draftResult.data) toast('Kaldığın çalışma geri yüklendi.');
if (import.meta.env.DEV) (window as unknown as { __kiyas: unknown }).__kiyas = { diffEditor, originalModel, modifiedModel, getChanges: () => changes, getCurrentChange: () => currentChange, merge, loadWorkspace, repository, monaco };
