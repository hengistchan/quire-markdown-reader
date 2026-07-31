const DATABASE = 'quire-workspaces';
const STORE = 'handles';
const ACTIVE_HANDLE = 'active-directory';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
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

export function saveWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<IDBValidKey> {
  return transact('readwrite', (store) => store.put(handle, ACTIVE_HANDLE));
}

export function loadWorkspaceHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return transact('readonly', (store) => store.get(ACTIVE_HANDLE));
}

export function clearWorkspaceHandle(): Promise<undefined> {
  return transact('readwrite', (store) => store.delete(ACTIVE_HANDLE));
}
