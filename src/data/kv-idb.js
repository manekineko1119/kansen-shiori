// IndexedDB の簡単な key-value（ブラウザだけ。設計書 4.5）
export function openKv(dbName = 'kansen-shiori', storeName = 'kv') {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(storeName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const run = (mode, fn) => new Promise((res, rej) => {
        const tx = db.transaction(storeName, mode);
        const r = fn(tx.objectStore(storeName));
        tx.oncomplete = () => res(r?.result);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      });
      resolve({
        get: (key) => run('readonly', (s) => s.get(key)),
        set: (key, value) => run('readwrite', (s) => s.put(value, key)),
        delete: (key) => run('readwrite', (s) => s.delete(key)),
      });
    };
  });
}
