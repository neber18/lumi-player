import { isSavedState, loadState, saveState } from "../src/storage";
import type { SavedState } from "../src/storage";
import { check, finish } from "./helpers";

/** localStorage mínimo en memoria para poder probar en Node. */
const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
} as Storage;

const valid: SavedState = {
  activeId: "p1",
  playlists: [
    {
      id: "p1",
      name: "Favoritas",
      tracks: [
        { id: "t1", title: "Canción", artist: "Artista", duration: 180, fileName: "a.mp3" },
        { id: "t2", title: "Video", artist: "Canal", duration: 0, fileName: "", source: "youtube", videoId: "dQw4w9WgXcQ" },
      ],
    },
  ],
};

check("estado válido se reconoce", isSavedState(valid));
check("sin playlists se rechaza", !isSavedState({ activeId: "p1" }));
check("activeId ausente se rechaza", !isSavedState({ playlists: [] }));
check("null y primitivos se rechazan", !isSavedState(null) && !isSavedState(42) && !isSavedState("texto"));
check(
  "canción con campos incorrectos se rechaza",
  !isSavedState({ activeId: "p1", playlists: [{ id: "p1", name: "x", tracks: [{ id: 1 }] }] })
);

check("loadState sin datos devuelve null", loadState() === null);

saveState(valid);
const loaded = loadState();
check("saveState y loadState hacen ida y vuelta", JSON.stringify(loaded) === JSON.stringify(valid));

memory.set("lumi-player:state:v1", "{esto no es json");
check("JSON corrupto devuelve null", loadState() === null);

memory.set("lumi-player:state:v1", JSON.stringify({ playlists: "no", activeId: 5 }));
check("estructura inesperada devuelve null", loadState() === null);

finish("Todas las pruebas de almacenamiento pasaron");
