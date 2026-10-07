import { DNode } from "./DoublyLinkedList";
import { InsertMode, Playlist, Track } from "./models";
import { Player } from "./Player";
import * as store from "./storage";
import { fetchOEmbed, getApiKey, parseVideoId, searchYouTube, setApiKey, thumbUrl, YTResult } from "./youtube";

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function hue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

const gradient = (text: string): string => {
  const h = hue(text);
  return `linear-gradient(135deg, hsl(${h} 80% 76%), hsl(${(h + 45) % 360} 75% 66%))`;
};

function parseName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: base || "Sin título", artist: "Artista desconocido" };
}

function readDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    const done = (v: number) => {
      a.removeAttribute("src");
      resolve(isFinite(v) ? v : 0);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 6000);
    a.src = url;
  });
}

const isAudio = (f: File): boolean =>
  f.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba|webm)$/i.test(f.name);

let toastTimer = 0;
function toast(msg: string): void {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 2600);
}

/** Diálogo simple (con o sin campo de texto). */
function ask(opts: { title: string; message?: string; input?: boolean; value?: string; ok?: string }): Promise<string | null> {
  const dialog = $<HTMLDialogElement>("dialog");
  const input = $<HTMLInputElement>("dialogInput");
  $("dialogTitle").textContent = opts.title;
  $("dialogMsg").textContent = opts.message ?? "";
  $("dialogMsg").hidden = !opts.message;
  input.hidden = !opts.input;
  input.value = opts.value ?? "";
  $("dialogOk").textContent = opts.ok ?? "Aceptar";

  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        if (dialog.returnValue !== "ok") return resolve(null);
        resolve(opts.input ? input.value.trim() || null : "ok");
      },
      { once: true }
    );
    dialog.returnValue = "cancel";
    dialog.showModal();
    if (opts.input) {
      input.focus();
      input.select();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

const player = new Player();
let playlists: Playlist[] = [];
let viewId = "";
let filter = "";
let dragFrom = -1;
let seeking = false;

const view = (): Playlist => playlists.find((p) => p.id === viewId) ?? playlists[0];

function persist(): void {
  store.saveState({
    activeId: viewId,
    playlists: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      tracks: p.list
        .toArray()
        .map(({ id, title, artist, duration, fileName, source, videoId, thumb }) => ({ id, title, artist, duration, fileName, source, videoId, thumb })),
    })),
  });
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function renderPlaylists(): void {
  $("playlists").innerHTML = playlists
    .map((p) => {
      const active = p.id === view().id ? " active" : "";
      const eq = player.playlist === p && player.playing ? '<span class="pl-eq">▶</span>' : "";
      return `<li class="pl-item${active}" data-id="${p.id}">
        <div class="pl-dot" style="background:${gradient(p.name)}">♪</div>
        <div class="pl-text"><b>${esc(p.name)}</b><small>${p.list.size} canciones</small></div>${eq}
      </li>`;
    })
    .join("");
}

function renderTracks(): void {
  const pl = view();
  const q = filter.toLowerCase();
  const rows: string[] = [];
  let i = 0;

  for (const node of pl.list.nodes()) {
    const t = node.value;
    const index = i++;
    if (q && !`${t.title} ${t.artist}`.toLowerCase().includes(q)) continue;
    const isCurrent = player.current === node;
    const isYT = t.source === "youtube";
    const tags =
      (isYT ? '<span class="tag yt-tag">YT</span>' : "") +
      (node === pl.list.head ? '<span class="tag">HEAD</span>' : "") +
      (node === pl.list.tail ? '<span class="tag">TAIL</span>' : "");
    const coverStyle = isYT && t.thumb ? `background-image:url('${esc(t.thumb)}')` : `background:${gradient(t.title)}`;
    rows.push(`<li class="track${isCurrent ? " active" : ""}" draggable="${q ? "false" : "true"}" data-index="${index}">
      <span class="grip" title="Arrastra para mover">⋮⋮</span>
      <span class="idx">${isCurrent && player.playing ? "▶" : index + 1}</span>
      <div class="mini-cover" style="${coverStyle}">${isYT ? "" : "♪"}</div>
      <div class="meta"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div>
      <span class="tags">${tags}</span>
      <span class="dur">${t.duration ? fmt(t.duration) : "–:––"}</span>
      <div class="row-actions">
        <button data-act="next" title="Reproducir a continuación" aria-label="Reproducir a continuación">⤵</button>
        <button data-act="up" title="Subir" aria-label="Subir">↑</button>
        <button data-act="down" title="Bajar" aria-label="Bajar">↓</button>
        <button data-act="del" title="Eliminar" aria-label="Eliminar">✕</button>
      </div>
    </li>`);
  }

  $("tracks").innerHTML = rows.join("");
  $("empty").hidden = pl.list.size > 0;
  if (pl.list.size > 0 && rows.length === 0) {
    $("tracks").innerHTML = '<li class="empty"><p>Sin resultados para esa búsqueda</p></li>';
  }
}

function renderHeader(): void {
  const pl = view();
  $("plName").textContent = pl.name;
  $("plMeta").textContent = `${pl.list.size} canciones${pl.list.size ? " · " + fmtLong(pl.totalDuration) : ""}`;
  const pos = $<HTMLInputElement>("insertPos");
  pos.max = String(pl.list.size + 1);
  if (+pos.value > pl.list.size + 1) pos.value = String(pl.list.size + 1);
}

function renderChain(): void {
  const el = $("chain");
  const pl = player.playlist;
  const node = player.current;

  if (!pl || !node) {
    el.innerHTML = `<div class="chain-head"><b>Lista doblemente enlazada</b></div>
      <p class="chain-hint">Reproduce una canción para ver cómo sus punteros <code>prev</code> y <code>next</code> apuntan a sus vecinas.</p>`;
    return;
  }

  const box = (label: string, n: DNode<Track> | null): string =>
    n
      ? `<div class="cnode"><small>${label}</small><b>${esc(n.value.title)}</b></div>`
      : `<div class="cnode null"><span>null</span></div>`;

  const idx = pl.list.indexOf(node) + 1;
  el.innerHTML = `
    <div class="chain-head"><b>Lista doblemente enlazada · «${esc(pl.name)}»</b>
      <small>nodo ${idx} de ${pl.list.size}</small></div>
    <div class="chain-row">
      ${box("prev", node.prev)}
      <span class="arrow">⇄</span>
      <div class="cnode current"><small>actual</small><b>${esc(node.value.title)}</b></div>
      <span class="arrow">⇄</span>
      ${box("next", node.next)}
    </div>`;
}

function renderNow(): void {
  const t = player.current?.value;
  $("nowTitle").textContent = t ? t.title : "Nada en reproducción";
  $("nowArtist").textContent = t ? t.artist : "Agrega canciones desde tu computador para empezar";
  $("nowPlaylist").textContent = player.playlist ? `Reproduciendo de · ${player.playlist.name}` : "Reproductor";
  $("cover").style.background = t ? gradient(t.title) : "";
  $("cover").classList.toggle("spin", player.playing && !player.isYouTube);
  $("cover").hidden = player.isYouTube;
  $("ytBox").hidden = !player.isYouTube;
  $("iconPlay").toggleAttribute("hidden", player.playing);
  $("iconPause").toggleAttribute("hidden", !player.playing);
  $("btnShuffle").classList.toggle("on", player.shuffle);
  const repeatLabel = { off: "no", all: "todas", one: "una" }[player.repeat];
  $("btnRepeat").textContent = `🔁 Repetir: ${repeatLabel}`;
  $("btnRepeat").classList.toggle("on", player.repeat !== "off");
  document.title = t ? `${player.playing ? "▶" : "⏸"} ${t.title} · Lumi` : "Lumi · Reproductor de música";
  updateMediaSession();
}

function renderAll(): void {
  renderPlaylists();
  renderHeader();
  renderTracks();
  renderNow();
  renderChain();
}

function setFill(input: HTMLInputElement): void {
  const max = +input.max || 100;
  input.style.setProperty("--fill", `${(+input.value / max) * 100}%`);
}

function updateProgress(): void {
  const d = player.duration;
  const now = player.currentTime;
  $("tCur").textContent = fmt(now);
  $("tDur").textContent = d > 0 ? fmt(d) : player.current ? fmt(player.current.value.duration) : "0:00";
  if (!seeking) {
    const seek = $<HTMLInputElement>("seek");
    seek.value = d > 0 ? String(Math.round((now / d) * 1000)) : "0";
    setFill(seek);
  }
}

/* ------------------------------------------------------------------ */
/* Operaciones sobre las listas                                        */
/* ------------------------------------------------------------------ */

/** Índice base donde se insertará según el modo elegido (inicio / final / posición). */
function insertBase(pl: Playlist): number {
  const mode = $<HTMLSelectElement>("insertMode").value as InsertMode;
  if (mode === "start") return 0;
  if (mode === "end") return pl.list.size;
  const pos = parseInt($<HTMLInputElement>("insertPos").value, 10);
  return Math.max(0, Math.min((isNaN(pos) ? 1 : pos) - 1, pl.list.size));
}

/** Libera los recursos de una canción (solo las locales tienen archivo guardado). */
function releaseTrack(t: Track): void {
  if (t.source !== "local") return;
  URL.revokeObjectURL(t.url);
  void store.deleteBlob(t.id);
}

async function addFiles(files: File[]): Promise<void> {
  const pl = view();
  const audio = files.filter(isAudio);
  if (audio.length === 0) {
    toast("No encontré archivos de audio en la selección");
    return;
  }

  const mode = $<HTMLSelectElement>("insertMode").value as InsertMode;
  const base = insertBase(pl);

  toast(`Cargando ${audio.length} ${audio.length === 1 ? "canción" : "canciones"}…`);

  for (let i = 0; i < audio.length; i++) {
    const file = audio[i];
    const id = uid();
    const url = URL.createObjectURL(file);
    const { title, artist } = parseName(file.name);
    const duration = await readDuration(url);
    void store.saveBlob(id, file);
    pl.list.insertAt(base + i, { id, title, artist, duration, fileName: file.name, source: "local", url });
  }

  persist();
  renderAll();
  const where = mode === "start" ? "al inicio" : mode === "end" ? "al final" : `desde la posición ${base + 1}`;
  toast(`${audio.length} ${audio.length === 1 ? "canción agregada" : "canciones agregadas"} ${where}`);
}

function removeNode(pl: Playlist, node: DNode<Track>): void {
  const wasCurrent = player.current === node && player.playlist === pl;
  const wasPlaying = player.playing;
  const successor = node.next ?? node.prev;
  const track = pl.list.removeNode(node);

  if (wasCurrent) {
    if (successor) player.playNode(pl, successor, wasPlaying);
    else player.stop();
  }
  releaseTrack(track);
}

async function deletePlaylist(pl: Playlist): Promise<void> {
  const ok = await ask({
    title: "Eliminar playlist",
    message: `¿Seguro que quieres eliminar «${pl.name}» y sus ${pl.list.size} canciones?`,
    ok: "Eliminar",
  });
  if (!ok) return;

  if (player.playlist === pl) player.stop();
  for (const t of pl.list) releaseTrack(t);
  playlists = playlists.filter((p) => p !== pl);
  if (playlists.length === 0) playlists.push(new Playlist(uid(), "Mi playlist"));
  viewId = playlists[0].id;
  persist();
  renderAll();
  toast("Playlist eliminada");
}

function playFromView(node: DNode<Track>): void {
  const pl = view();
  if (player.current === node && player.playlist === pl) player.toggle();
  else player.playNode(pl, node);
}

/* ------------------------------------------------------------------ */
/* Media Session (teclas multimedia del teclado / pantalla de bloqueo) */
/* ------------------------------------------------------------------ */

function updateMediaSession(): void {
  if (!("mediaSession" in navigator)) return;
  const t = player.current?.value;
  navigator.mediaSession.metadata = t
    ? new MediaMetadata({ title: t.title, artist: t.artist, album: player.playlist?.name ?? "" })
    : null;
}

function setupMediaSession(): void {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => player.toggle());
  ms.setActionHandler("pause", () => player.toggle());
  ms.setActionHandler("previoustrack", () => player.prev());
  ms.setActionHandler("nexttrack", () => player.next());
  ms.setActionHandler("seekbackward", () => player.seekBy(-10));
  ms.setActionHandler("seekforward", () => player.seekBy(10));
}

/* ------------------------------------------------------------------ */
/* YouTube: diálogo de búsqueda / enlaces                              */
/* ------------------------------------------------------------------ */

let ytAdded = 0; // canciones agregadas en esta sesión del diálogo (para mantener el orden)
let ytBusy = false;

function ytSetStatus(msg: string, isError = false): void {
  const el = $("ytStatus");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function ytWhereText(): string {
  const mode = $<HTMLSelectElement>("insertMode").value as InsertMode;
  if (mode === "start") return "al inicio";
  if (mode === "end") return "al final";
  return `desde la posición ${insertBase(view()) + 1}`;
}

function ytRenderResults(results: YTResult[]): void {
  $("ytResults").innerHTML = results
    .map(
      (r, i) => `<li class="yt-item">
        <img src="${esc(r.thumb)}" alt="" loading="lazy" />
        <div class="meta"><b>${esc(r.title)}</b><small>${esc(r.channel)}${r.duration ? " · " + fmt(r.duration) : ""}</small></div>
        <button class="btn primary" data-i="${i}">＋ Agregar</button>
      </li>`
    )
    .join("");

  $("ytResults").onclick = (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
    if (!btn) return;
    const r = results[+btn.dataset.i!];
    addYouTubeTrack(r);
    btn.textContent = "✓ Agregada";
    btn.classList.add("done");
  };
}

function addYouTubeTrack(r: YTResult): void {
  const pl = view();
  const mode = $<HTMLSelectElement>("insertMode").value as InsertMode;
  const index = mode === "end" ? pl.list.size : insertBase(pl) + ytAdded;
  ytAdded++;

  const track: Track = {
    id: uid(),
    title: r.title,
    artist: r.channel,
    duration: r.duration,
    fileName: "",
    source: "youtube",
    url: "",
    videoId: r.videoId,
    thumb: r.thumb,
  };
  pl.list.insertAt(index, track);
  persist();
  renderAll();
  toast(`«${r.title}» agregada ${mode === "start" ? "al inicio" : mode === "end" ? "al final" : `en la posición ${Math.min(index, pl.list.size - 1) + 1}`}`);
}

async function ytSubmit(): Promise<void> {
  if (ytBusy) return;
  const query = $<HTMLInputElement>("ytQuery").value.trim();
  if (!query) return;

  ytBusy = true;
  ytSetStatus("Buscando…");
  $("ytResults").innerHTML = "";
  try {
    const videoId = parseVideoId(query);
    if (videoId) {
      // Enlace directo: no necesita clave de API
      const info = await fetchOEmbed(videoId);
      ytRenderResults([
        {
          videoId,
          title: info?.title ?? "Video de YouTube",
          channel: info?.channel ?? "YouTube",
          thumb: thumbUrl(videoId),
          duration: 0,
        },
      ]);
      ytSetStatus("Video encontrado. Pulsa «Agregar».");
      return;
    }

    const key = getApiKey();
    if (!key) {
      ($("ytKeyBox") as HTMLDetailsElement).open = true;
      $<HTMLInputElement>("ytKey").focus();
      ytSetStatus("Para buscar por nombre guarda primero tu clave de API (o pega un enlace del video).", true);
      return;
    }

    const results = await searchYouTube(key, query);
    ytRenderResults(results);
    ytSetStatus(results.length ? `${results.length} resultados. Pulsa «Agregar» en los que quieras.` : "Sin resultados para esa búsqueda.");
  } catch (err) {
    ytSetStatus(err instanceof Error ? err.message : "No se pudo completar la búsqueda.", true);
  } finally {
    ytBusy = false;
  }
}

function ytUpdateKeyState(): void {
  $("ytKeyState").textContent = getApiKey() ? "· guardada ✓" : "· opcional";
}

function bindYouTube(): void {
  const dialog = $<HTMLDialogElement>("ytDialog");

  $("btnYouTube").onclick = () => {
    ytAdded = 0;
    $("ytWhere").textContent = ytWhereText();
    $<HTMLInputElement>("ytKey").value = getApiKey();
    ytUpdateKeyState();
    ytSetStatus("");
    $("ytResults").innerHTML = "";
    dialog.showModal();
    $<HTMLInputElement>("ytQuery").focus();
  };
  $("ytClose").onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) dialog.close(); // clic en el fondo
  });
  $("ytForm").addEventListener("submit", (e) => {
    e.preventDefault();
    void ytSubmit();
  });
  $("ytSaveKey").onclick = () => {
    setApiKey($<HTMLInputElement>("ytKey").value.trim());
    ytUpdateKeyState();
    ytSetStatus(getApiKey() ? "Clave guardada en este navegador." : "Clave eliminada.");
  };
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function bindEvents(): void {
  const fileInput = $<HTMLInputElement>("fileInput");

  // Reproductor
  $("btnPlay").onclick = () => {
    if (player.current) return player.toggle();
    const first = view().list.head;
    if (first) player.playNode(view(), first);
    else toast("Agrega canciones primero");
  };
  $("btnNext").onclick = () => player.next();
  $("btnPrev").onclick = () => player.prev();
  $("btnFwd").onclick = () => player.seekBy(10);
  $("btnBack").onclick = () => player.seekBy(-10);
  $("btnShuffle").onclick = () => {
    player.shuffle = !player.shuffle;
    renderNow();
  };
  $("btnRepeat").onclick = () => {
    player.cycleRepeat();
    renderNow();
  };
  $<HTMLSelectElement>("speed").onchange = (e) => {
    player.setRate(+(e.target as HTMLSelectElement).value);
  };

  const volume = $<HTMLInputElement>("volume");
  const savedVol = localStorage.getItem("lumi-player:volume");
  if (savedVol) volume.value = savedVol;
  player.setVolume(+volume.value / 100);
  setFill(volume);
  volume.oninput = () => {
    player.setVolume(+volume.value / 100);
    $("btnMute").textContent = +volume.value === 0 ? "🔇" : "🔊";
    setFill(volume);
    try { localStorage.setItem("lumi-player:volume", volume.value); } catch { /* */ }
  };
  $("btnMute").onclick = () => {
    $("btnMute").textContent = player.toggleMute() ? "🔇" : "🔊";
  };

  // Barra de progreso
  const seek = $<HTMLInputElement>("seek");
  seek.addEventListener("input", () => {
    seeking = true;
    setFill(seek);
    const d = player.duration || player.current?.value.duration || 0;
    if (d > 0) $("tCur").textContent = fmt((+seek.value / 1000) * d);
  });
  seek.addEventListener("change", () => {
    player.seekFraction(+seek.value / 1000);
    seeking = false;
  });
  player.onTick = updateProgress;

  // YouTube nos dice el título y la duración reales al empezar a reproducir
  player.onTrackInfo = (track, info) => {
    if (track.source !== "youtube") return;
    let changed = false;
    if (info.duration && Math.abs(track.duration - info.duration) > 1) { track.duration = info.duration; changed = true; }
    if (info.title && (track.title !== info.title || track.fileName === "")) { track.title = info.title; changed = true; }
    if (info.artist && track.artist !== info.artist) { track.artist = info.artist; changed = true; }
    if (changed) {
      persist();
      renderAll();
    }
  };
  player.onError = (_track, message) => toast(message);

  player.onChange = () => {
    renderNow();
    renderChain();
    renderTracks();
    renderPlaylists();
    updateProgress();
  };

  // Playlists
  $("newPlaylist").onclick = async () => {
    const name = await ask({ title: "Nueva playlist", message: "¿Cómo se llamará?", input: true, value: `Playlist ${playlists.length + 1}`, ok: "Crear" });
    if (!name) return;
    const pl = new Playlist(uid(), name);
    playlists.push(pl);
    viewId = pl.id;
    filter = "";
    $<HTMLInputElement>("search").value = "";
    persist();
    renderAll();
  };
  $("playlists").addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>(".pl-item");
    if (!li) return;
    viewId = li.dataset.id!;
    filter = "";
    $<HTMLInputElement>("search").value = "";
    persist();
    renderAll();
  });
  $("btnRename").onclick = async () => {
    const pl = view();
    const name = await ask({ title: "Renombrar playlist", input: true, value: pl.name, ok: "Guardar" });
    if (!name) return;
    pl.name = name;
    persist();
    renderAll();
  };
  $("btnDeletePl").onclick = () => void deletePlaylist(view());
  $("btnClear").onclick = async () => {
    const pl = view();
    if (pl.list.isEmpty) return;
    const ok = await ask({ title: "Vaciar playlist", message: `Se quitarán las ${pl.list.size} canciones de «${pl.name}».`, ok: "Vaciar" });
    if (!ok) return;
    if (player.playlist === pl) player.stop();
    for (const t of pl.list) releaseTrack(t);
    pl.list.clear();
    persist();
    renderAll();
  };
  $("btnSort").onclick = () => {
    view().list.reorder((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
    persist();
    renderAll();
    toast("Ordenada de la A a la Z");
  };
  $("btnShufflePl").onclick = () => {
    view().list.shuffle();
    persist();
    renderAll();
    toast("Playlist mezclada");
  };

  // Agregar canciones
  const modeSel = $<HTMLSelectElement>("insertMode");
  modeSel.onchange = () => ($("posField").hidden = modeSel.value !== "at");
  $("btnAdd").onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = "";
    void addFiles(files);
  };

  bindYouTube();

  // Búsqueda
  $<HTMLInputElement>("search").oninput = (e) => {
    filter = (e.target as HTMLInputElement).value.trim();
    renderTracks();
  };

  // Lista de canciones: clic y acciones
  const tracksEl = $("tracks");
  tracksEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const li = target.closest<HTMLElement>(".track");
    if (!li) return;
    const pl = view();
    const index = +li.dataset.index!;
    const node = pl.list.nodeAt(index);
    if (!node) return;

    const act = target.closest<HTMLElement>("[data-act]")?.dataset.act;
    switch (act) {
      case "del":
        removeNode(pl, node);
        persist();
        renderAll();
        toast("Canción eliminada");
        return;
      case "up":
        if (pl.list.move(index, index - 1)) { persist(); renderAll(); }
        return;
      case "down":
        if (pl.list.move(index, index + 1)) { persist(); renderAll(); }
        return;
      case "next": {
        if (player.playlist === pl && player.current && player.current !== node) {
          pl.list.moveAfter(node, player.current);
          persist();
          renderAll();
          toast("Sonará a continuación");
        } else {
          toast(player.current ? "Esa canción ya es la actual" : "Reproduce una canción primero");
        }
        return;
      }
      default:
        playFromView(node);
    }
  });

  // Arrastrar y soltar para reordenar
  tracksEl.addEventListener("dragstart", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>(".track");
    if (!li) return;
    dragFrom = +li.dataset.index!;
    li.classList.add("dragging");
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", String(dragFrom));
  });
  tracksEl.addEventListener("dragover", (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    const li = (e.target as HTMLElement).closest<HTMLElement>(".track");
    tracksEl.querySelectorAll(".drop-before, .drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after"));
    if (!li) return;
    li.classList.add(+li.dataset.index! < dragFrom ? "drop-before" : "drop-after");
  });
  tracksEl.addEventListener("drop", (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const li = (e.target as HTMLElement).closest<HTMLElement>(".track");
    const to = li ? +li.dataset.index! : view().list.size - 1;
    const from = dragFrom;
    dragFrom = -1;
    if (view().list.move(from, to)) {
      persist();
      toast(`Movida de la posición ${from + 1} a la ${to + 1}`);
    }
    renderAll();
  });
  tracksEl.addEventListener("dragend", () => {
    dragFrom = -1;
    renderTracks();
  });

  // Soltar archivos desde el explorador
  const zone = $("dropzone");
  let depth = 0;
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  zone.addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth++; zone.classList.add("dragging-file"); } });
  zone.addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; zone.classList.remove("dragging-file"); } });
  zone.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  zone.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    zone.classList.remove("dragging-file");
    void addFiles(Array.from(e.dataTransfer!.files));
  });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop", (e) => { if (hasFiles(e)) e.preventDefault(); });

  // Atajos de teclado
  window.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" &&(e.target as HTMLInputElement).type !== "range") return;
    if (tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case " ": e.preventDefault(); $("btnPlay").click(); break;
      case "n": case "N": player.next(); break;
      case "p": case "P": player.prev(); break;
      case "ArrowRight": if (tag !== "INPUT") { e.preventDefault(); player.seekBy(10); } break;
      case "ArrowLeft": if (tag !== "INPUT") { e.preventDefault(); player.seekBy(-10); } break;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

async function restore(): Promise<void> {
  const saved = store.loadState();
  if (saved && saved.playlists.length) {
    for (const sp of saved.playlists) {
      const pl = new Playlist(sp.id, sp.name);
      for (const st of sp.tracks) {
        if (st.source === "youtube" && st.videoId) {
          pl.list.addLast({ ...st, source: "youtube", url: "" });
          continue;
        }
        const blob = await store.getBlob(st.id);
        if (!blob) continue; // el archivo ya no está guardado
        pl.list.addLast({ ...st, source: "local", url: URL.createObjectURL(blob) });
      }
      playlists.push(pl);
    }
    viewId = playlists.some((p) => p.id === saved.activeId) ? saved.activeId : playlists[0].id;
  } else {
    const pl = new Playlist(uid(), "Mi primera playlist");
    playlists.push(pl);
    viewId = pl.id;
  }
}

async function init(): Promise<void> {
  await restore();
  bindEvents();
  setupMediaSession();
  setFill($("seek") as HTMLInputElement);
  persist();
  renderAll();
}

void init();
