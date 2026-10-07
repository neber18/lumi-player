import { DNode } from "./DoublyLinkedList";
import { Playlist, RepeatMode, Track } from "./models";
import { loadYouTubeApi, YTPlayer } from "./youtube";

export interface TrackInfo {
  title?: string;
  artist?: string;
  duration?: number;
}

/**
 * Motor de reproducción. Mantiene un puntero (`current`) al nodo actual
 * de la lista doble: "siguiente" = current.next, "anterior" = current.prev.
 *
 * Tiene dos motores y elige según el origen de la canción:
 *  - <audio> para archivos del computador
 *  - YouTube IFrame Player para videos de YouTube
 */
export class Player {
  readonly audio = new Audio();
  playlist: Playlist | null = null;
  current: DNode<Track> | null = null;
  shuffle = false;
  repeat: RepeatMode = "off";

  onChange: () => void = () => {};
  onTick: () => void = () => {};
  onTrackInfo: (track: Track, info: TrackInfo) => void = () => {};
  onError: (track: Track, message: string) => void = () => {};

  private yt: YTPlayer | null = null;
  private ytLoading: Promise<YTPlayer> | null = null;
  private ytState = -1;
  private poll = 0;
  private token = 0;
  private infoSent = false;
  private errorStreak = 0;

  private vol = 0.8;
  private mutedFlag = false;
  private rate = 1;

  constructor() {
    this.audio.preload = "metadata";
    this.audio.addEventListener("ended", () => this.handleEnded());
    this.audio.addEventListener("play", () => this.onChange());
    this.audio.addEventListener("pause", () => this.onChange());
    this.audio.addEventListener("error", () => {
      if (this.current?.value.source === "local" && this.audio.getAttribute("src")) {
        this.onError(this.current.value, "No se pudo reproducir este archivo.");
      }
    });
    this.audio.addEventListener("timeupdate", () => this.onTick());
    this.audio.addEventListener("loadedmetadata", () => this.onTick());
    this.applyVolume();
  }

  /* ---------- estado ---------- */

  get isYouTube(): boolean {
    return this.current?.value.source === "youtube";
  }

  get playing(): boolean {
    if (this.isYouTube) return this.ytState === 1 || this.ytState === 3;
    return !this.audio.paused && !this.audio.ended;
  }

  get currentTime(): number {
    if (this.isYouTube) return this.yt?.getCurrentTime() ?? 0;
    return this.audio.currentTime;
  }

  /** Duración en segundos; 0 si todavía no se conoce. */
  get duration(): number {
    const d = this.isYouTube ? this.yt?.getDuration() ?? 0 : this.audio.duration;
    return isFinite(d) && d > 0 ? d : 0;
  }

  /* ---------- reproducción ---------- */

  playNode(playlist: Playlist, node: DNode<Track>, autoplay = true): void {
    this.playlist = playlist;
    this.current = node;
    this.infoSent = false;
    this.ytState = -1;
    const track = node.value;
    const token = ++this.token;

    if (track.source === "youtube") {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.onChange(); // muestra el visor de video antes de crear el reproductor
      void this.startYouTube(track, autoplay, token);
    } else {
      this.pauseYouTube();
      this.audio.src = track.url;
      this.applyVolume();
      if (autoplay) void this.audio.play().catch(() => {});
      this.onChange();
    }
  }

  toggle(): void {
    if (!this.current) return;
    if (this.isYouTube) {
      if (!this.yt) return;
      if (this.playing) this.yt.pauseVideo();
      else this.yt.playVideo();
    } else if (this.audio.paused) {
      void this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  }

  stop(): void {
    this.token++;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.pauseYouTube();
    this.current = null;
    this.onChange();
  }

  /** Canción siguiente. `auto` = true cuando termina sola la anterior. */
  next(auto = false): void {
    if (!this.playlist || !this.current) return;
    const list = this.playlist.list;
    let target: DNode<Track> | null;

    if (this.shuffle && list.size > 1) {
      do {
        target = list.nodeAt(Math.floor(Math.random() * list.size));
      } while (target === this.current);
    } else {
      target = this.current.next;
      if (!target && this.repeat === "all") target = list.head;
    }

    if (target) {
      this.playNode(this.playlist, target);
    } else if (auto) {
      this.pause();
      this.seekTo(0);
    }
  }

  /** Canción anterior (si ya pasaron 3 s, reinicia la actual). */
  prev(): void {
    if (!this.playlist || !this.current) return;
    if (this.currentTime > 3) {
      this.seekTo(0);
      return;
    }
    let target = this.current.prev;
    if (!target && this.repeat === "all") target = this.playlist.list.tail;
    if (target) this.playNode(this.playlist, target);
    else this.seekTo(0);
  }

  seekTo(seconds: number): void {
    if (!this.current) return;
    if (this.isYouTube) this.yt?.seekTo(seconds, true);
    else this.audio.currentTime = seconds;
    this.onTick();
  }

  seekBy(seconds: number): void {
    if (!this.current) return;
    const d = this.duration || Infinity;
    this.seekTo(Math.max(0, Math.min(d, this.currentTime + seconds)));
  }

  seekFraction(fraction: number): void {
    if (!this.current) return;
    const d = this.duration || this.current.value.duration;
    if (d > 0) this.seekTo(d * fraction);
  }

  cycleRepeat(): RepeatMode {
    this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
    return this.repeat;
  }

  /* ---------- volumen, silencio y velocidad (válidos para ambos motores) ---------- */

  setVolume(volume01: number): void {
    this.vol = volume01;
    this.mutedFlag = false;
    this.applyVolume();
  }

  toggleMute(): boolean {
    this.mutedFlag = !this.mutedFlag;
    this.applyVolume();
    return this.mutedFlag;
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.audio.defaultPlaybackRate = rate;
    this.audio.playbackRate = rate;
    this.yt?.setPlaybackRate(rate);
  }

  private applyVolume(): void {
    this.audio.volume = this.vol;
    this.audio.muted = this.mutedFlag;
    if (this.yt) {
      this.yt.setVolume(Math.round(this.vol * 100));
      if (this.mutedFlag) this.yt.mute();
      else this.yt.unMute();
    }
  }

  /* ---------- YouTube ---------- */

  private pause(): void {
    this.audio.pause();
    if (this.isYouTube) this.yt?.pauseVideo();
  }

  private pauseYouTube(): void {
    try {
      this.yt?.pauseVideo();
    } catch {
      /* el reproductor aún no está listo */
    }
    this.ytState = -1;
  }

  private ensureYouTube(): Promise<YTPlayer> {
    if (this.yt) return Promise.resolve(this.yt);
    if (!this.ytLoading) {
      this.ytLoading = loadYouTubeApi()
        .then(
          (YT) =>
            new Promise<YTPlayer>((resolve) => {
              const playerVars: Record<string, unknown> = { playsinline: 1, rel: 0, modestbranding: 1 };
              if (location.protocol.startsWith("http")) playerVars.origin = location.origin;
              const p: YTPlayer = new YT.Player("ytPlayer", {
                width: "100%",
                height: "100%",
                playerVars,
                events: {
                  onReady: () => {
                    this.yt = p;
                    this.applyVolume();
                    p.setPlaybackRate(this.rate);
                    resolve(p);
                  },
                  onStateChange: (e: { data: number }) => this.onYouTubeState(e.data),
                  onError: (e: { data: number }) => this.onYouTubeError(e.data),
                },
              });
            })
        )
        .catch((err) => {
          this.ytLoading = null;
          throw err;
        });
    }
    return this.ytLoading;
  }

  private async startYouTube(track: Track, autoplay: boolean, token: number): Promise<void> {
    try {
      const yt = await this.ensureYouTube();
      if (token !== this.token || !track.videoId) return;
      if (autoplay) yt.loadVideoById(track.videoId);
      else yt.cueVideoById(track.videoId);
      this.startPolling();
    } catch {
      if (token === this.token) {
        this.onError(track, "No se pudo cargar YouTube. Revisa tu conexión a internet.");
      }
    }
  }

  private startPolling(): void {
    if (this.poll) return;
    this.poll = window.setInterval(() => {
      if (!this.isYouTube) {
        clearInterval(this.poll);
        this.poll = 0;
        return;
      }
      this.onTick();
    }, 250);
  }

  private onYouTubeState(state: number): void {
    if (!this.isYouTube || !this.yt || !this.current) return;
    this.ytState = state;

    // 1 = reproduciendo, 5 = listo (cued): ya conocemos título y duración reales
    if ((state === 1 || state === 5) && !this.infoSent) {
      this.infoSent = true;
      const data = this.yt.getVideoData();
      this.onTrackInfo(this.current.value, {
        title: data?.title || undefined,
        artist: data?.author || undefined,
        duration: this.yt.getDuration() || undefined,
      });
    }
    if (state === 1) this.errorStreak = 0;
    if (state === 0) this.handleEnded();
    this.onChange();
  }

  private onYouTubeError(code: number): void {
    const track = this.current?.value;
    if (!track) return;
    const messages: Record<number, string> = {
      2: "El enlace del video no es válido.",
      5: "YouTube no pudo reproducir este video en el navegador.",
      100: "El video fue eliminado o es privado.",
      101: "El dueño del video no permite reproducirlo fuera de YouTube.",
      150: "El dueño del video no permite reproducirlo fuera de YouTube.",
      153: "YouTube no recibió el origen de la página. Abre la app desde su dirección web (https://), no como archivo local.",
    };
    this.onError(track, messages[code] ?? "No se pudo reproducir el video.");
    this.ytState = -1;
    this.onChange();

    // Salta automáticamente a la siguiente si el video simplemente no está disponible
    const skippable = [5, 100, 101, 150].includes(code);
    if (skippable && this.playlist && this.errorStreak++ < Math.min(3, this.playlist.list.size - 1)) {
      this.next(true);
    }
  }

  private handleEnded(): void {
    if (this.repeat === "one") {
      this.seekTo(0);
      if (this.isYouTube) this.yt?.playVideo();
      else void this.audio.play().catch(() => {});
    } else {
      this.next(true);
    }
    this.onChange();
  }
}
