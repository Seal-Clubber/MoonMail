// Resolve localStorage only when a method is called. Some browser privacy
// policies throw from the property getter itself; reading public mail must work.
export const browserStorage: Storage = {
  get length() {
    return window.localStorage.length;
  },
  getItem(key) {
    return window.localStorage.getItem(key);
  },
  setItem(key, value) {
    window.localStorage.setItem(key, value);
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
  },
  clear() {
    window.localStorage.clear();
  },
  key(index) {
    return window.localStorage.key(index);
  },
};

// Use a disposable nonsecret value, never rewrite or clear a transaction journal.
// There is deliberately no memory-only fallback for financial records.
export function checkBrowserStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = browserStorage,
): string | undefined {
  const key = `ghostdrop:storage-check:${crypto.randomUUID()}`;
  try {
    storage.setItem(key, "1");
    if (storage.getItem(key) !== "1")
      throw new Error("Storage did not retain its value");
    storage.removeItem(key);
    return undefined;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* The same browser policy may block cleanup. */
    }
    return "This browser cannot save delivery records. Allow site storage, then recheck. Reading mail remains available; sending and collection are paused.";
  }
}
