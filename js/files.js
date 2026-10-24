// Demo attachments live in IndexedDB on this device only; nothing is uploaded anywhere.
const DB_NAME = 'mihmah-files';
const STORE = 'files';

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { conn.close(); resolve(req?.result); };
    tx.onerror = () => { conn.close(); reject(tx.error); };
  });
}

export const putFile = (id, blob) => run('readwrite', (s) => s.put(blob, id));
export const getFile = (id) => run('readonly', (s) => s.get(id));
export const clearFiles = () => run('readwrite', (s) => s.clear());
