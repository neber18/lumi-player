# Lumi · Reproductor de música con listas doblemente enlazadas

Reproductor web en **TypeScript** con tema claro. Cada playlist es una
`DoublyLinkedList<Track>` propia (sin arrays como estructura base).
Reproduce **archivos de tu computador** y **videos de YouTube** en la misma playlist.

## Probarlo en tu computador

```bash
npm install
npm run serve      # compila y sirve ./site en http://localhost:3000
```

> Los videos de YouTube **no funcionan abriendo `index.html` con doble clic**
> (YouTube necesita una dirección `http://` o `https://`). Los archivos de audio locales sí.

## Subirlo a la nube (sitio estático, gratis)

Es solo HTML + JS, no necesita servidor. Dos opciones:

### Opción A · GitHub Pages (ya configurado)
1. Crea un repositorio en GitHub y sube esta carpeta (`git init`, `git add .`, `git commit`, `git push` a la rama `main`).
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. Cada `push` a `main` ejecuta `.github/workflows/deploy.yml` (instala, prueba, compila y publica).
   Quedará en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.

### Opción B · Netlify
- Arrastra la carpeta `site/` (genérala con `npm run build:site`) a <https://app.netlify.com/drop>,
  o conecta el repositorio: `netlify.toml` ya define el comando y la carpeta de publicación.
- Vercel y Cloudflare Pages también sirven: comando `npm run build:site`, carpeta de salida `site`.

## YouTube

| Qué | Cómo |
| --- | --- |
| **Pegar un enlace** (`watch`, `youtu.be`, `shorts`, `music.youtube.com` o el id) | Funciona sin ninguna clave |
| **Buscar por nombre** | Requiere una clave de *YouTube Data API v3* |

Obtener la clave (gratis): Google Cloud Console → crear proyecto → habilitar
**YouTube Data API v3** → Credenciales → *Crear credencial → Clave de API*.
Pégala en el diálogo «Desde YouTube → Clave de la API». Se guarda **solo en tu navegador**
(nunca se sube al código ni al repositorio).

Recomendado: en la consola de Google restringe la clave a «Referentes HTTP» con la dirección
de tu sitio publicado y a la API «YouTube Data API v3». La cuota gratuita (10 000 unidades/día)
alcanza para ~100 búsquedas diarias.

Límites propios de YouTube:
- Se reproduce con su reproductor incrustado (el video se ve en la tarjeta principal; las condiciones de uso no permiten extraer solo el audio ni descargar).
- Algunos videos no se pueden incrustar; la app avisa y salta al siguiente.
- Pueden aparecer anuncios, según el video.
- Con la pestaña en segundo plano o el móvil bloqueado, el navegador puede pausar el video.

## Qué se guarda y dónde

- **Playlists** (orden, nombres, canciones de YouTube): `localStorage` del navegador.
- **Archivos de audio locales**: IndexedDB del navegador.
- Nada se sube a un servidor: al estar publicado, cada persona tiene sus propias playlists en su navegador.
  Para playlists compartidas entre dispositivos haría falta un backend con cuentas (siguiente paso posible).

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/DoublyLinkedList.ts` | Lista doble genérica: `addFirst`, `addLast`, `insertAt`, `removeNode`, `removeAt`, `move`, `moveAfter`, `reorder`, `shuffle`, `nodeAt` (recorre desde el extremo más cercano) |
| `src/Player.ts` | Motor: puntero al nodo actual (`next`/`prev`), dos motores (`<audio>` y YouTube) |
| `src/youtube.ts` | IFrame Player API, búsqueda Data API v3, lectura de enlaces |
| `src/storage.ts` | Persistencia (IndexedDB + localStorage) |
| `src/models.ts` | `Track`, `Playlist` |
| `src/main.ts` | Interfaz y eventos |
| `tests/` | Pruebas de la lista y de YouTube (`npm test`) |
| `scripts/make-site.mjs` | Genera `site/` con lo necesario para publicar |

## Funciones

- Varias playlists: crear, renombrar, eliminar, vaciar.
- Agregar canciones (computador o YouTube) **al inicio, al final o en una posición** concreta.
- **Arrastrar y soltar** para reordenar; botones ↑ ↓ por canción.
- Eliminar canciones (si es la actual, pasa a la siguiente).
- Siguiente, anterior (reinicia si pasaron 3 s), adelantar y retroceder 10 s, barra de progreso.
- «Reproducir a continuación», aleatorio, repetir (no / todas / una), velocidad, volumen y silencio.
- Ordenar A–Z, mezclar, búsqueda dentro de la playlist.
- Panel con los punteros `prev ⇄ actual ⇄ next` del nodo en reproducción.
- Atajos: `Espacio`, `N`, `P`, `←`, `→`, y teclas multimedia del sistema.
