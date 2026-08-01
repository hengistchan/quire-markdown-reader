const DATABASE = 'quire-workspaces';
const STORE = 'handles';
const LEGACY_ACTIVE_HANDLE = 'active-directory';
const ACTIVE_WORKSPACE = 'active-workspace-id';
const WORKSPACE_PREFIX = 'workspace:';
const FILE_PREFIX = 'file:';

export interface PersistedWorkspaceHandle {
  id: string;
  kind: 'workspace';
  name: string;
  handle: FileSystemDirectoryHandle;
  savedAt: number;
}

export interface PersistedFileHandle {
  id: string;
  kind: 'file';
  name: string;
  handle: FileSystemFileHandle;
  savedAt: number;
}

type PersistedHandle = PersistedWorkspaceHandle | PersistedFileHandle;

function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open workspace storage.'));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Workspace storage failed.'));
    transaction.oncomplete = () => database.close();
  });
}

function read<T>(key: IDBValidKey): Promise<T | undefined> {
  return transact('readonly', (store) => store.get(key));
}

function write(value: unknown, key: IDBValidKey): Promise<IDBValidKey> {
  return transact('readwrite', (store) => store.put(value, key));
}

async function findMatchingHandle<T extends FileSystemHandle>(kind: PersistedHandle['kind'], handle: T): Promise<PersistedHandle | undefined> {
  const records = (await transact('readonly', (store) => store.getAll())) as unknown[];
  for (const candidate of records) {
    if (!candidate || typeof candidate !== 'object' || (candidate as PersistedHandle).kind !== kind) continue;
    const record = candidate as PersistedHandle;
    if (typeof handle.isSameEntry === 'function' && await handle.isSameEntry(record.handle)) return record;
  }
  return undefined;
}

export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle, existingId?: string): Promise<string> {
  const previous = existingId ? await loadWorkspaceRecord(existingId) : await findMatchingHandle('workspace', handle) as PersistedWorkspaceHandle | undefined;
  const id = previous?.id ?? existingId ?? createId();
  const record: PersistedWorkspaceHandle = { id, kind: 'workspace', name: handle.name, handle, savedAt: Date.now() };
  await write(record, `${WORKSPACE_PREFIX}${id}`);
  await write(id, ACTIVE_WORKSPACE);
  return id;
}

export async function loadWorkspaceRecord(id: string): Promise<PersistedWorkspaceHandle | undefined> {
  const record = await read<PersistedWorkspaceHandle>(`${WORKSPACE_PREFIX}${id}`);
  return record?.kind === 'workspace' ? record : undefined;
}

export async function loadActiveWorkspace(): Promise<PersistedWorkspaceHandle | undefined> {
  const activeId = await read<string>(ACTIVE_WORKSPACE);
  if (activeId) return loadWorkspaceRecord(activeId);

  const legacy = await read<FileSystemDirectoryHandle>(LEGACY_ACTIVE_HANDLE);
  if (!legacy) return undefined;
  const id = await saveWorkspaceHandle(legacy);
  return loadWorkspaceRecord(id);
}

export async function loadWorkspaceHandle(id?: string): Promise<FileSystemDirectoryHandle | undefined> {
  return id ? (await loadWorkspaceRecord(id))?.handle : (await loadActiveWorkspace())?.handle;
}

export async function saveFileHandle(handle: FileSystemFileHandle, existingId?: string): Promise<string> {
  const previous = existingId ? await loadFileRecord(existingId) : await findMatchingHandle('file', handle) as PersistedFileHandle | undefined;
  const id = previous?.id ?? existingId ?? createId();
  await write({ id, kind: 'file', name: handle.name, handle, savedAt: Date.now() } satisfies PersistedFileHandle, `${FILE_PREFIX}${id}`);
  return id;
}

export async function loadFileRecord(id: string): Promise<PersistedFileHandle | undefined> {
  const record = await read<PersistedFileHandle>(`${FILE_PREFIX}${id}`);
  return record?.kind === 'file' ? record : undefined;
}

export async function clearWorkspaceHandle(): Promise<undefined> {
  await transact('readwrite', (store) => store.delete(ACTIVE_WORKSPACE));
  await transact('readwrite', (store) => store.delete(LEGACY_ACTIVE_HANDLE));
  return undefined;
}
