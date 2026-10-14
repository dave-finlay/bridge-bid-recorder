// Saves sessions on the phone using IndexedDB, the browser's built-in
// database. Each session is stored whole (boards included) under its id,
// so saving after every call is one small write.

const DB_NAME = 'bridge-bid-recorder';
const DB_VERSION = 1;
const STORE = 'sessions';

let opening = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // Runs the first time, and whenever DB_VERSION goes up.
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

// Runs one request against the sessions store, and resolves with its
// result once the transaction has committed (so a save is really saved).
async function run(mode, makeRequest) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = makeRequest(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

// All sessions, newest first: by the date played, then by when created.
export async function listSessions() {
  const sessions = await run('readonly', (store) => store.getAll());
  return sessions.sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

// The session with this id, or undefined.
export function getSession(id) {
  return run('readonly', (store) => store.get(id));
}

// Adds or replaces the session. IndexedDB stores a copy, so later changes
// to the object need another save.
export function saveSession(session) {
  return run('readwrite', (store) => store.put(session));
}

export function deleteSession(id) {
  return run('readwrite', (store) => store.delete(id));
}

// Asks the browser not to clear our data when the phone is low on space.
// Browsers may say no, and older ones don't support it; either way the
// app still works, so exports remain the real backup.
export async function requestPersistence() {
  return (await navigator.storage?.persist?.()) ?? false;
}

// A short unique id such as 'm2x9k1c-4f7q2a'. crypto.randomUUID() would
// be neater, but browsers only allow it over HTTPS, and while developing
// we load the app over plain HTTP from the laptop.
export function newId() {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${time}-${random}`;
}
