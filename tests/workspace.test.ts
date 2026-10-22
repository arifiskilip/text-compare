import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkspace,
  createWorkspaceRepository,
  DEFAULT_SETTINGS,
  MAX_WORKSPACES,
  STORAGE_KEYS,
} from '../src/workspace.ts';
import type { StorageLike, Workspace } from '../src/workspace.ts';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  writeError?: Error;
  readError?: Error;
  getItem(key: string) {
    if (this.readError) throw this.readError;
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.writeError) throw this.writeError;
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.writeError) throw this.writeError;
    this.values.delete(key);
  }
}

const workspace = (id: string, updatedAt: number) => createWorkspace({
  id, updatedAt, title: `Çalışma ${id}`, original: 'İlk metin\r\n', modified: 'Yeni metin\n',
});

test('new browser gets empty history, empty draft and independent default settings', () => {
  const repository = createWorkspaceRepository(new MemoryStorage());
  assert.deepEqual(repository.loadWorkspaces(), { ok: true, data: [] });
  assert.deepEqual(repository.loadDraft(), { ok: true, data: null });
  const settings = repository.loadSettings();
  assert.deepEqual(settings.data, DEFAULT_SETTINGS);
  settings.data.fontSize = 22;
  assert.equal(repository.loadSettings().data.fontSize, 14);
});

test('corrupt JSON and wrong record types are returned as recoverable errors', () => {
  const storage = new MemoryStorage();
  const repository = createWorkspaceRepository(storage);
  storage.setItem(STORAGE_KEYS.workspaces, '{');
  storage.setItem(STORAGE_KEYS.draft, 'false');
  storage.setItem(STORAGE_KEYS.settings, '[]');
  assert.equal(repository.loadWorkspaces().ok, false);
  assert.deepEqual(repository.loadWorkspaces().data, []);
  assert.equal(repository.loadDraft().ok, false);
  assert.equal(repository.loadDraft().data, null);
  assert.equal(repository.loadSettings().ok, false);
  assert.deepEqual(repository.loadSettings().data, DEFAULT_SETTINGS);
  // A subsequent valid save can repair corrupt records.
  assert.equal(repository.saveWorkspace(workspace('repair', 1)).ok, true);
  assert.equal(repository.loadWorkspaces().data[0].id, 'repair');
});

test('history salvages valid records, removes duplicate ids and sorts latest first', () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEYS.workspaces, JSON.stringify([
    workspace('a', 2), { id: 'invalid', updatedAt: 3 }, workspace('b', 4),
    workspace('a', 1), { ...workspace('nan', 1), updatedAt: null },
  ]));
  const result = createWorkspaceRepository(storage).loadWorkspaces();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'corrupt');
  assert.deepEqual(result.data.map((item) => item.id), ['b', 'a']);
  assert.equal(result.data[1].updatedAt, 2);
});

test('history keeps the newest 20 and updates an existing record without duplicates', () => {
  const storage = new MemoryStorage();
  const repository = createWorkspaceRepository(storage);
  for (let index = 0; index < 25; index++) {
    assert.equal(repository.saveWorkspace(workspace(String(index), index)).ok, true);
  }
  const all = repository.loadWorkspaces().data;
  assert.equal(all.length, MAX_WORKSPACES);
  assert.deepEqual(all.map((item) => Number(item.id)), Array.from({ length: 20 }, (_, i) => 24 - i));
  repository.saveWorkspace({ ...workspace('10', 100), modified: 'Son sürüm' });
  assert.equal(repository.loadWorkspaces().data[0].id, '10');
  assert.equal(repository.loadWorkspaces().data[0].modified, 'Son sürüm');
  assert.equal(repository.loadWorkspaces().data.length, MAX_WORKSPACES);
  repository.removeWorkspace('10');
  assert.equal(repository.loadWorkspaces().data.some((item) => item.id === '10'), false);
});

test('draft round trip preserves exact text and can be cleared independently of history', () => {
  const repository = createWorkspaceRepository(new MemoryStorage());
  const current = workspace('draft', 10);
  repository.saveWorkspace(current);
  assert.equal(repository.saveDraft(current).ok, true);
  assert.deepEqual(repository.loadDraft().data, current);
  assert.equal(repository.clearDraft().ok, true);
  assert.equal(repository.loadDraft().data, null);
  assert.equal(repository.loadWorkspaces().data.length, 1);
});

test('settings validate types and clamp the font size', () => {
  const storage = new MemoryStorage();
  const repository = createWorkspaceRepository(storage);
  storage.setItem(STORAGE_KEYS.settings, JSON.stringify({
    theme: 'unknown', fontSize: 500, wordWrap: 'false', ignoreWhitespace: true,
    hideUnchanged: null, renderSideBySide: false,
  }));
  assert.deepEqual(repository.loadSettings().data, {
    ...DEFAULT_SETTINGS, fontSize: 24, ignoreWhitespace: true, renderSideBySide: false,
  });
  assert.equal(repository.saveSettings({ ...DEFAULT_SETTINGS, fontSize: -1 }).data.fontSize, 11);
});

test('invalid workspaces cannot overwrite existing saved text', () => {
  const repository = createWorkspaceRepository(new MemoryStorage());
  repository.saveWorkspace(workspace('valid', 1));
  assert.equal(repository.saveWorkspace({ ...workspace('bad', 2), original: 1 } as unknown as Workspace).ok, false);
  assert.equal(repository.saveDraft({ ...workspace('bad', 2), updatedAt: Infinity }).ok, false);
  assert.equal(repository.loadWorkspaces().data[0].id, 'valid');
});

test('out-of-range timestamps cannot crash history date formatting', () => {
  const storage = new MemoryStorage();
  const repository = createWorkspaceRepository(storage);
  storage.setItem(STORAGE_KEYS.workspaces, JSON.stringify([
    workspace('valid', 1), workspace('invalid-date', 1e100),
  ]));
  const result = repository.loadWorkspaces();
  assert.equal(result.code, 'corrupt');
  assert.deepEqual(result.data.map((item) => item.id), ['valid']);
  assert.doesNotThrow(() => result.data.forEach((item) =>
    new Intl.DateTimeFormat('tr-TR').format(item.updatedAt)));
  assert.equal(repository.saveWorkspace(workspace('invalid-save', Number.MAX_VALUE)).code, 'invalid');
});

test('quota and access failures return useful errors without losing persisted data', () => {
  const storage = new MemoryStorage();
  const repository = createWorkspaceRepository(storage);
  repository.saveWorkspace(workspace('saved', 1));
  storage.writeError = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  const result = repository.saveWorkspace(workspace('new', 2));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'quota');
  assert.deepEqual(result.data.map((item) => item.id), ['saved']);
  assert.deepEqual(repository.loadWorkspaces().data.map((item) => item.id), ['saved']);
  assert.equal(repository.saveDraft(workspace('draft', 3)).ok, false);
  assert.equal(repository.clearDraft().ok, false);
  storage.writeError = undefined;
  storage.readError = new Error('denied');
  assert.equal(repository.loadWorkspaces().code, 'unavailable');
  assert.equal(repository.saveWorkspace(workspace('new', 2)).ok, false);
  storage.readError = undefined;
  assert.equal(repository.loadWorkspaces().data[0].id, 'saved');
});
