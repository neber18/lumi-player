/**
 * Persistencia local:
 *  - IndexedDB guarda los archivos de audio (blobs).
 *  - localStorage guarda las playlists (orden de canciones y metadatos).
 */

const DB_NAME = "lumi-player";
const STORE = "files";
const META_KEY = "lumi-player:state:v1";

export interface SavedTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  fileName: string;
  /** Ausente en datos guardados con versiones anteriores (= "local"). */
  source?: "local" | "youtube";
  videoId?: string;
  thumb?: string;
}

export interface SavedPlaylist {
  id: string;
  name: string;
  tracks: SavedTrack[];
}

export interface SavedState {
  playlists: SavedPlaylist[];
  activeId: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put(blob, id));
  } catch {
    /* sin espacio o modo privado: la canción funciona esta sesión */
  }
}

export async function getBlob(id: string): Promise<Blob | null> {
  try {
    return ((await tx("readonly", (s) => s.get(id))) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* ignorar */
  }
}

export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(state));
  } catch {
    /* ignorar */
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function isSavedTrack(v: unknown): v is SavedTrack {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.artist === "string" &&
    typeof v.duration === "number" &&
    typeof v.fileName === "string"
  );
}

/** Comprueba que lo leído de localStorage tiene la forma de un estado válido. */
export function isSavedState(v: unknown): v is SavedState {
  return (
    isRecord(v) &&
    typeof v.activeId === "string" &&
    Array.isArray(v.playlists) &&
    v.playlists.every(
      (p) => isRecord(p) && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.tracks) && p.tracks.every(isSavedTrack)
    )
  );
}

export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
