import { DoublyLinkedList } from "./DoublyLinkedList";

export type TrackSource = "local" | "youtube";

export interface Track {
  id: string;
  title: string;
  artist: string;
  /** Duración en segundos (0 si aún no se conoce). */
  duration: number;
  fileName: string;
  /** "local" = archivo del computador · "youtube" = video incrustado de YouTube. */
  source: TrackSource;
  /** URL temporal (blob:) para canciones locales. Vacía en las de YouTube. */
  url: string;
  videoId?: string;
  thumb?: string;
}

export type RepeatMode = "off" | "all" | "one";
export type InsertMode = "end" | "start" | "at";

export class Playlist {
  constructor(
    public id: string,
    public name: string,
    public list: DoublyLinkedList<Track> = new DoublyLinkedList<Track>()
  ) {}

  get totalDuration(): number {
    let total = 0;
    for (const t of this.list) total += t.duration;
    return total;
  }
}
