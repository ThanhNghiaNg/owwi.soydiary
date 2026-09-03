import {
  isPersistedActivitySaveDraft,
  type PersistedActivitySaveDraft,
} from "./activity-save-draft";

const DATABASE_NAME = "soydiary:activity-save-queue";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open activity save queue"));
  });
}

async function transactStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = work(transaction.objectStore(STORE_NAME));
      request.onerror = () => reject(request.error ?? new Error("Unable to update activity save queue"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("Activity save queue was aborted"));
    });
  } finally {
    database.close();
  }
}

export async function saveActivitySaveDraft(draft: PersistedActivitySaveDraft) {
  await transactStore("readwrite", (store) => store.put(draft));
}

export async function deleteActivitySaveDraft(id: string) {
  await transactStore("readwrite", (store) => store.delete(id));
}

export async function listActivitySaveDrafts() {
  const records = await transactStore<unknown[]>("readonly", (store) => store.getAll());
  return records.filter(isPersistedActivitySaveDraft);
}
