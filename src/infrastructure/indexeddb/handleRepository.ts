import { openIndexedDatabase, transact as runTransaction } from './database';
import type {
  HandleRepository, PersistedFileHandle, PersistedWorkspaceHandle,
} from '../../application/ports/handleRepository';

export type { PersistedFileHandle, PersistedWorkspaceHandle } from '../../application/ports/handleRepository';

const DATABASE = 'quire-workspaces';
const STORE = 'handles';
const LEGACY_ACTIVE_HANDLE = 'active-directory';
const ACTIVE_WORKSPACE = 'active-workspace-id';
const WORKSPACE_PREFIX = 'workspace:';
const FILE_PREFIX = 'file:';

type PersistedHandle = PersistedWorkspaceHandle | PersistedFileHandle;

function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return openIndexedDatabase(DATABASE, 2, (database) => {
    if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return runTransaction(database, STORE, mode, action);
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

export class IndexedDBHandleRepository implements HandleRepository {
  saveWorkspace(handle: FileSystemDirectoryHandle, existingId?: string): Promise<string> {
    return saveWorkspaceHandle(handle, existingId);
  }

  saveFile(handle: FileSystemFileHandle, existingId?: string): Promise<string> {
    return saveFileHandle(handle, existingId);
  }

  getActiveWorkspace(): Promise<PersistedWorkspaceHandle | undefined> {
    return loadActiveWorkspace();
  }

  getWorkspace(id: string): Promise<PersistedWorkspaceHandle | undefined> {
    return loadWorkspaceRecord(id);
  }

  getFile(id: string): Promise<PersistedFileHandle | undefined> {
    return loadFileRecord(id);
  }

  async clearWorkspace(): Promise<void> {
    await clearWorkspaceHandle();
  }
}
