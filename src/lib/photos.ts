/**
 * Receipt photos, kept in IndexedDB.
 *
 * They live apart from the main group data because localStorage's few megabytes
 * would be gone after a handful of receipts, and because a photo store that
 * fails should never take the group's numbers down with it.
 */

const DB_NAME = "cost-split-photos";
const DB_VERSION = 1;
const STORE = "photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser has no photo storage available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Couldn't open photo storage."));
  });
}

export async function putPhoto(id: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Couldn't save the photo."));
      tx.onabort = () => reject(tx.error ?? new Error("Couldn't save the photo."));
    });
  } finally {
    db.close();
  }
}

export async function getPhoto(id: string): Promise<string | null> {
  try {
    const db = await openDb();
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(id);
        request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve(); // a photo we can't delete isn't worth failing over
      });
    } finally {
      db.close();
    }
  } catch {
    // Nothing to clean up.
  }
}

/** Longest edge, in pixels, that a stored receipt is scaled down to. */
const MAX_EDGE = 1400;

/**
 * Read a picked file and shrink it to something worth storing.
 *
 * Phone camera images run 3–8 MB; at this size a receipt stays readable at a
 * small fraction of that.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("That file isn't an image."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const source = String(reader.result);
      const image = new Image();
      image.onerror = () => reject(new Error("Couldn't read that image."));
      image.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(source); // no canvas: keep the original rather than losing the photo
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        } catch {
          resolve(source);
        }
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}
