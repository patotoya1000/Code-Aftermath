// Backdrop art: ONE painted picture that replaces the tiled ground of a scenario (assets/backdrops/*.jpg). Presentation only.
// A scenario names its backdrop in `terrain.backdrop` (data/world.js); the render projection carries the id; the renderer stretches the picture over the whole
// map rectangle (the picture has the map's aspect ratio, so one grid cell = the same share of the picture everywhere). Until the picture has loaded - or when
// the file is missing - `get()` answers null and the renderer keeps drawing the ordinary terrain tiles, so nothing ever draws blank.
//
// SILHOUETTE BANDS: a backdrop may also name a TOP and a BOTTOM silhouette (transparent PNGs, a forest / cliff skyline). They are not part of the map: they frame it
// from outside, in the space the canvas has above and below the map rectangle (and overlap the map edge a little). `bandLayout()` is the pure placement maths.

export const BACKDROP_DIR = 'assets/backdrops/';
export const BACKDROP_FILES = Object.freeze({ outpost: 'outpost.jpg' });
/**
 * Silhouette bands per backdrop. Each picture is measured in its own pixels:
 *   edge  the row that sits ON the map edge. top: the flat bottom of the dark mass (rows below it are empty padding); bottom: the average tree line (taller tips
 *         rise above the map's bottom edge, everything below it hangs into the canvas margin).
 *   first the first row that has anything in it (the tallest tip)
 */
export const BACKDROP_BANDS = Object.freeze({
  outpost: Object.freeze({
    top: Object.freeze({ file: 'top_silhouette.png', edge: 241, first: 3 }),
    bottom: Object.freeze({ file: 'bottom_silhouette.png', edge: 40, first: 3 }),
  }),
});
export const BAND_TUNING = Object.freeze({
  overlapCells: 0.3,   // how far a band's edge reaches onto the map (hides the hard edge of the picture and any sub-pixel gap)
  minCells: 2,         // a band is never thinner than this, even when the canvas leaves no margin (then it overlaps the map by the difference)
  vignetteCells: 1.4,  // soft shadow the top band throws onto the map (the dark mass ends in a straight line)
  parallaxExtra: 0.5,  // the layer is (1 + parallaxExtra x ratio) times as wide as the canvas; panning slides it by that slack
});

/** Lazy image cache, same shape as createNodeArt: `get(id)` is the loaded image or null. `loadImage(url)` is injectable for tests / non-DOM hosts. */
export function createBackdropArt({ baseUrl = BACKDROP_DIR, files = BACKDROP_FILES, bands = BACKDROP_BANDS, loadImage = null } = {}) {
  const cache = new Map();
  const make = loadImage ?? (typeof Image === 'undefined' ? null : (url) => { const img = new Image(); img.src = url; return img; });
  const isReady = (img) => Boolean(img && img.complete !== false && (img.naturalWidth ?? img.width) > 0);
  const load = (file) => {
    let e = cache.get(file);
    if (!e) { e = { img: make(`${baseUrl}${file}`), failed: false }; try { e.img.onerror = () => { e.failed = true; }; } catch { /* non-DOM image stand-in */ } cache.set(file, e); }
    return !e.failed && isReady(e.img) ? e.img : null;
  };
  return {
    files, bands,
    has: (id) => Object.hasOwn(files, id),
    get(id) { return !id || !make || !Object.hasOwn(files, id) ? null : load(files[id]); },
    /** The loaded silhouettes of a backdrop: { top?: { img, ...spec }, bottom?: { img, ...spec } } - a band that is missing or still loading is simply absent. */
    bands(id) {
      const spec = id && make && Object.hasOwn(bands, id) ? bands[id] : null; if (!spec) return {};
      const out = {};
      for (const side of ['top', 'bottom']) { const s = spec[side]; const img = s ? load(s.file) : null; if (img) out[side] = { img, ...s }; }
      return out;
    },
  };
}

/**
 * Where one silhouette band goes (canvas pixels). Pure.
 *   side     'top' | 'bottom'
 *   view     { w, h }                the canvas, CSS pixels
 *   world    { y, h }                the map rectangle on that canvas
 *   cell     pixels per grid cell
 *   image    { w, h }                the picture's own size;  spec { edge, first }
 *   t        0..1                    where the camera is horizontally (0.5 = centred, which is always the case at zoom 1)
 *   parallax 0..1                    0 = the band is exactly canvas-wide and never slides
 * Returns { scale, tileW, y, h, edgeY, tiles: [{ x, flip }] }: draw the picture `h` tall at `y` once per tile (a flipped tile is mirrored, so the skyline never shows a seam),
 * and `edgeY` is the canvas row where the band meets the map.
 */
export function bandLayout({ side, view, world, cell, image, spec, t = 0.5, parallax = 0.5, tuning = BAND_TUNING }) {
  const margin = Math.max(0, side === 'top' ? world.y : view.h - (world.y + world.h));
  const want = Math.max(margin + tuning.overlapCells * cell, tuning.minCells * cell); // the height the band should cover, measured from the map edge outward
  const rows = side === 'top' ? spec.edge - spec.first : image.h - spec.edge;          // the rows of the picture that lie outside the map
  const layerW = view.w * (1 + tuning.parallaxExtra * Math.min(1, Math.max(0, parallax)));
  const scale = Math.min(want / rows, layerW / image.w);                                 // never wider than the natural fit: a short margin shrinks the picture, it does not crop it
  const tileW = image.w * scale; const h = image.h * scale;
  const edgeY = side === 'top' ? world.y + tuning.overlapCells * cell : world.y + world.h - tuning.overlapCells * cell;
  const y = edgeY - spec.edge * scale;
  const x0 = -(layerW - view.w) * Math.min(1, Math.max(0, t));
  const tiles = [];
  if (tileW > 0) for (let k = Math.floor(-x0 / tileW); x0 + k * tileW < view.w; k++) tiles.push({ x: x0 + k * tileW, flip: Math.abs(k) % 2 === 1 });
  return { scale, tileW, y, h, edgeY, tiles };
}
