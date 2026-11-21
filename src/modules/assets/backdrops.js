// Backdrop art: ONE painted picture that replaces the tiled ground of a scenario (assets/backdrops/*.jpg). Presentation only.
// A scenario names its backdrop in `terrain.backdrop` (data/world.js); the render projection carries the id; the renderer stretches the picture over the whole
// map rectangle (the picture has the map's aspect ratio, so one grid cell = the same share of the picture everywhere). Until the picture has loaded - or when
// the file is missing - `get()` answers null and the renderer keeps drawing the ordinary terrain tiles, so nothing ever draws blank.

export const BACKDROP_DIR = 'assets/backdrops/';
export const BACKDROP_FILES = Object.freeze({ outpost: 'outpost.jpg' });

/** Lazy image cache, same shape as createNodeArt: `get(id)` is the loaded image or null. `loadImage(url)` is injectable for tests / non-DOM hosts. */
export function createBackdropArt({ baseUrl = BACKDROP_DIR, files = BACKDROP_FILES, loadImage = null } = {}) {
  const cache = new Map();
  const make = loadImage ?? (typeof Image === 'undefined' ? null : (url) => { const img = new Image(); img.src = url; return img; });
  const isReady = (img) => Boolean(img && img.complete !== false && (img.naturalWidth ?? img.width) > 0);
  return {
    files,
    has: (id) => Object.hasOwn(files, id),
    get(id) {
      if (!id || !make || !Object.hasOwn(files, id)) return null;
      let e = cache.get(id);
      if (!e) { e = { img: make(`${baseUrl}${files[id]}`), failed: false }; try { e.img.onerror = () => { e.failed = true; }; } catch { /* non-DOM image stand-in */ } cache.set(id, e); }
      return !e.failed && isReady(e.img) ? e.img : null;
    },
  };
}
