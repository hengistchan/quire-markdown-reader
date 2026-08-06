import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openIndexedDatabase, transact } from './database';

const DATABASE = 'quire-transaction-tests';
const STORE = 'records';

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

afterEach(deleteDatabase);

async function openTestDatabase(): Promise<IDBDatabase> {
  return openIndexedDatabase(DATABASE, 1, (database) => database.createObjectStore(STORE));
}

describe('IndexedDB transaction wrapper', () => {
  it('resolves only after the transaction completes', async () => {
    const database = await openTestDatabase();
    let completed = false;
    const promise = transact(database, STORE, 'readwrite', (store) => {
      store.transaction.addEventListener('complete', () => { completed = true; });
      return store.put('saved', 'key');
    });

    await expect(promise).resolves.toBe('key');
    expect(completed).toBe(true);
  });

  it('rejects when the transaction aborts', async () => {
    const database = await openTestDatabase();
    const promise = transact(database, STORE, 'readwrite', (store) => {
      store.add('first', 'duplicate');
      return store.add('second', 'duplicate');
    });

    await expect(promise).rejects.toBeTruthy();
  });
});
