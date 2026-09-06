export function openIndexedDatabase(
  name: string,
  version: number,
  upgrade: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error(`Could not open IndexedDB database ${name}.`));
  });
}

export function transact<T>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let request: IDBRequest<T>;
    let result: T;

    try {
      request = operation(transaction.objectStore(storeName));
    } catch (error) {
      database.close();
      try {
        transaction.abort();
      } catch {
        // The transaction may already be inactive.
      }
      reject(error);
      return;
    }

    request.onsuccess = () => {
      result = request.result;
    };

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };

    const rejectTransaction = () => {
      database.close();
      reject(
        transaction.error ??
          request.error ??
          new Error(mode === 'readonly' ? 'IndexedDB read transaction failed.' : 'IndexedDB write transaction failed.'),
      );
    };

    transaction.onerror = rejectTransaction;
    transaction.onabort = rejectTransaction;
  });
}
