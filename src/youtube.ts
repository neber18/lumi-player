/**
 * Integración con YouTube:
 *  - IFrame Player API: reproduce el video dentro de la página (permitido por YouTube).
 *  - Data API v3: búsqueda por nombre (requiere una clave de API del propio usuario).
 *  - Enlaces: se pueden agregar sin ninguna clave.
 */

export interface YTPlayer {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  setPlaybackRate(rate: number): void;
  getVideoData(): { title: string; author: string; video_id: string };
}

export interface YTNamespace {
  Player: new (elementId: string, options: Record<string, unknown>) => YTPlayer;
}

export interface YTResult {
  videoId: string;
  title: string;
  channel: string;
  thumb: string;
  duration: number;
}

const KEY_STORAGE = "lumi-player:yt-api-key";

export const getApiKey = (): string => {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
};

export const setApiKey = (key: string): void => {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignorar */
  }
};

export const thumbUrl = (videoId: string): string => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

/* ---------- Carga de la IFrame API ---------- */

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);

  if (!apiPromise) {
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
      const previous = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(w.YT!);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => reject(new Error("No se pudo cargar YouTube"));
      document.head.appendChild(script);
      window.setTimeout(() => reject(new Error("YouTube tardó demasiado en cargar")), 15000);
    }).catch((err) => {
      apiPromise = null;
      throw err;
    });
  }
  return apiPromise;
}

/* ---------- Enlaces ---------- */

const ID_RE = /^[\w-]{11}$/;

/** Extrae el id de un enlace de YouTube (watch, youtu.be, shorts, embed, live) o de un id suelto. */
export function parseVideoId(input: string): string | null {
  const text = input.trim();
  if (ID_RE.test(text)) return text;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const host = url.hostname.replace(/^www\.|^m\.|^music\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "watch") id = url.searchParams.get("v");
      else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1] ?? null;
    }
    return id && ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Título y canal de un video sin necesidad de clave (oEmbed). */
export async function fetchOEmbed(videoId: string): Promise<{ title: string; channel: string } | null> {
  try {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const res = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    return data.title ? { title: data.title, channel: data.author_name ?? "YouTube" } : null;
  } catch {
    return null;
  }
}

/* ---------- Búsqueda (Data API v3) ---------- */

interface SearchResponse {
  error?: { message?: string; errors?: { reason?: string }[] };
  items?: {
    id: { videoId?: string };
    snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } };
  }[];
}

interface VideosResponse {
  items?: { id: string; contentDetails: { duration: string } }[];
}

const decodeEntities = (s: string): string => {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
};

export function parseIsoDuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0);
}

function apiErrorMessage(data: SearchResponse): string {
  const reason = data.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded") return "Se agotó la cuota diaria de la API de YouTube. Prueba mañana o pega enlaces directos.";
  if (reason === "keyInvalid" || reason === "badRequest") return "La clave de API no es válida.";
  if (reason === "accessNotConfigured" || reason === "forbidden")
    return "La clave no tiene habilitada «YouTube Data API v3» o su restricción bloquea este sitio.";
  return data.error?.message ?? "YouTube rechazó la búsqueda.";
}

export async function searchYouTube(key: string, query: string): Promise<YTResult[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    maxResults: "12",
    q: query,
    key,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const data = (await res.json()) as SearchResponse;
  if (!res.ok) throw new Error(apiErrorMessage(data));

  const items = (data.items ?? []).filter((i) => i.id.videoId);
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id.videoId!);
  const durations = new Map<string, number>();
  try {
    const vp = new URLSearchParams({ part: "contentDetails", id: ids.join(","), key });
    const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vp}`);
    if (vr.ok) {
      const vd = (await vr.json()) as VideosResponse;
      for (const v of vd.items ?? []) durations.set(v.id, parseIsoDuration(v.contentDetails.duration));
    }
  } catch {
    /* las duraciones son opcionales */
  }

  return items.map((i) => ({
    videoId: i.id.videoId!,
    title: decodeEntities(i.snippet.title),
    channel: decodeEntities(i.snippet.channelTitle),
    thumb: i.snippet.thumbnails?.medium?.url ?? thumbUrl(i.id.videoId!),
    duration: durations.get(i.id.videoId!) ?? 0,
  }));
}
