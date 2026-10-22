/** All text stays in this browser's local storage. */
export interface Workspace {
  id: string;
  title: string;
  original: string;
  modified: string;
  originalName: string;
  modifiedName: string;
  language: string;
  updatedAt: number;
}

export interface Settings {
  theme: 'dark' | 'light';
  fontSize: number;
  wordWrap: boolean;
  ignoreWhitespace: boolean;
  hideUnchanged: boolean;
  renderSideBySide: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageErrorCode = 'unavailable' | 'quota' | 'corrupt' | 'invalid';
export type StorageResult<T> =
  | { ok: true; data: T; error?: undefined; code?: undefined }
  | { ok: false; data: T; error: string; code: StorageErrorCode };

export const MAX_WORKSPACES = 20;
export const STORAGE_KEYS = {
  workspaces: 'kiyas.workspaces.v1',
  draft: 'kiyas.draft.v1',
  settings: 'kiyas.settings.v1',
} as const;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  theme: 'dark',
  fontSize: 14,
  wordWrap: false,
  ignoreWhitespace: false,
  hideUnchanged: false,
  renderSideBySide: true,
});

const success = <T>(data: T): StorageResult<T> => ({ ok: true, data });
const failure = <T>(data: T, code: StorageErrorCode, error: string): StorageResult<T> =>
  ({ ok: false, data, code, error });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseWorkspace(value: unknown): Workspace | null {
  if (!isRecord(value)
    || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.title !== 'string' || !value.title.trim()
    || typeof value.original !== 'string'
    || typeof value.modified !== 'string'
    || typeof value.originalName !== 'string'
    || typeof value.modifiedName !== 'string'
    || typeof value.language !== 'string' || !value.language.trim()
    || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)
    || value.updatedAt < 0 || value.updatedAt > 8.64e15) return null;

  // Copy explicit fields so stored objects cannot inject unrelated properties.
  return {
    id: value.id,
    title: value.title,
    original: value.original,
    modified: value.modified,
    originalName: value.originalName,
    modifiedName: value.modifiedName,
    language: value.language,
    updatedAt: value.updatedAt,
  };
}

export function createWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: globalThis.crypto?.randomUUID?.()
      ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    title: 'Yeni karşılaştırma',
    original: '',
    modified: '',
    originalName: 'orijinal.txt',
    modifiedName: 'degistirilmis.txt',
    language: 'plaintext',
    updatedAt: Date.now(),
    ...overrides,
  };
}

function normalizeWorkspaces(values: Workspace[]): Workspace[] {
  const unique = new Map<string, Workspace>();
  for (const value of values) {
    const previous = unique.get(value.id);
    if (!previous || value.updatedAt >= previous.updatedAt) unique.set(value.id, value);
  }
  return [...unique.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_WORKSPACES);
}

function parseSettings(value: unknown): Settings {
  const source = isRecord(value) ? value : {};
  const result: Settings = { ...DEFAULT_SETTINGS };
  if (source.theme === 'dark' || source.theme === 'light') result.theme = source.theme;
  if (typeof source.fontSize === 'number' && Number.isFinite(source.fontSize)) {
    result.fontSize = Math.min(24, Math.max(11, Math.round(source.fontSize)));
  }
  for (const key of ['wordWrap', 'ignoreWhitespace', 'hideUnchanged', 'renderSideBySide'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  return result;
}

function storageFailure<T>(data: T, cause: unknown): StorageResult<T> {
  const name = isRecord(cause) ? cause.name : undefined;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return failure(data, 'quota', 'Tarayıcının kayıt alanı dolu. Bazı kayıtları silip yeniden deneyin.');
  }
  return failure(data, 'unavailable', 'Tarayıcı kayıt alanına erişilemiyor. Metinlerinizi dosyaya kaydedebilirsiniz.');
}

/** Pass a StorageLike for tests; browsers use localStorage automatically. No method throws. */
export function createWorkspaceRepository(storage?: StorageLike) {
  const getStorage = (): StorageLike => {
    const resolved = storage ?? globalThis.localStorage;
    if (!resolved) throw new Error('Storage unavailable');
    return resolved;
  };

  function read<T>(key: string, fallback: T): StorageResult<unknown | T> {
    let raw: string | null;
    try {
      raw = getStorage().getItem(key);
    } catch (cause) {
      return storageFailure(fallback, cause);
    }
    if (raw === null) return success(fallback);
    try {
      return success(JSON.parse(raw) as unknown);
    } catch {
      return failure(fallback, 'corrupt', 'Kayıtlı veri okunamadı. Bozuk kayıt atlandı.');
    }
  }

  function write<T>(key: string, value: unknown, data: T): StorageResult<T> {
    try {
      getStorage().setItem(key, JSON.stringify(value));
      return success(data);
    } catch (cause) {
      return storageFailure(data, cause);
    }
  }

  function remove(key: string): StorageResult<null> {
    try {
      getStorage().removeItem(key);
      return success(null);
    } catch (cause) {
      return storageFailure(null, cause);
    }
  }

  function loadWorkspaces(): StorageResult<Workspace[]> {
    const result = read(STORAGE_KEYS.workspaces, []);
    if (!result.ok) return { ...result, data: [] };
    if (!Array.isArray(result.data)) {
      return failure([], 'corrupt', 'Kayıtlı karşılaştırmaların biçimi geçersiz.');
    }
    const parsed = result.data.map(parseWorkspace);
    const valid = normalizeWorkspaces(parsed.filter((item): item is Workspace => item !== null));
    if (parsed.some((item) => item === null)) {
      return failure(valid, 'corrupt', 'Bazı kayıtlı karşılaştırmalar bozuk olduğu için atlandı.');
    }
    return success(valid);
  }

  function saveWorkspace(workspace: Workspace): StorageResult<Workspace[]> {
    const parsed = parseWorkspace(workspace);
    if (!parsed) return failure([], 'invalid', 'Karşılaştırma bilgileri geçersiz.');
    const previous = loadWorkspaces();
    // Do not overwrite unknown existing data if reading the storage itself failed.
    if (!previous.ok && previous.code !== 'corrupt') return previous;
    const next = normalizeWorkspaces([
      ...previous.data.filter((item) => item.id !== parsed.id), parsed,
    ]);
    const result = write(STORAGE_KEYS.workspaces, next, next);
    return result.ok ? result : { ...result, data: previous.data };
  }

  function removeWorkspace(id: string): StorageResult<Workspace[]> {
    const previous = loadWorkspaces();
    if (!previous.ok && previous.code !== 'corrupt') return previous;
    const next = previous.data.filter((item) => item.id !== id);
    const result = write(STORAGE_KEYS.workspaces, next, next);
    return result.ok ? result : { ...result, data: previous.data };
  }

  function loadDraft(): StorageResult<Workspace | null> {
    const result = read(STORAGE_KEYS.draft, null);
    if (!result.ok) return { ...result, data: null };
    if (result.data === null) return success(null);
    const draft = parseWorkspace(result.data);
    return draft ? success(draft) : failure(null, 'corrupt', 'Otomatik kaydedilen çalışma okunamadı.');
  }

  function saveDraft(workspace: Workspace): StorageResult<null> {
    const parsed = parseWorkspace(workspace);
    return parsed
      ? write(STORAGE_KEYS.draft, parsed, null)
      : failure(null, 'invalid', 'Otomatik kaydedilecek çalışma geçersiz.');
  }

  function loadSettings(): StorageResult<Settings> {
    const defaults = { ...DEFAULT_SETTINGS };
    const result = read(STORAGE_KEYS.settings, defaults);
    if (!result.ok) return { ...result, data: defaults };
    if (!isRecord(result.data)) {
      return failure(defaults, 'corrupt', 'Kayıtlı tercihler okunamadı. Varsayılan tercihler kullanılıyor.');
    }
    return success(parseSettings(result.data));
  }

  function saveSettings(settings: Settings): StorageResult<Settings> {
    const normalized = parseSettings(settings);
    return write(STORAGE_KEYS.settings, normalized, normalized);
  }

  return {
    loadWorkspaces,
    saveWorkspace,
    removeWorkspace,
    loadDraft,
    saveDraft,
    clearDraft: () => remove(STORAGE_KEYS.draft),
    loadSettings,
    saveSettings,
  };
}
