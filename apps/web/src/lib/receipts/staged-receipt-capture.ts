const databaseName = "food-receipt-capture";
const storeName = "captures";
const captureKey = "latest";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Receipt capture storage could not be opened."));
  });
}

export async function stageReceiptCapture(file: File) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(file, captureKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Receipt capture could not be saved."));
  });
  database.close();
}

export async function takeStagedReceiptCapture() {
  const database = await openDatabase();
  const file = await new Promise<File | null>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.get(captureKey);
    request.onsuccess = () => {
      const result = request.result;
      store.delete(captureKey);
      resolve(result instanceof File ? result : null);
    };
    request.onerror = () => reject(request.error ?? new Error("Receipt capture could not be loaded."));
  });
  database.close();
  return file;
}
