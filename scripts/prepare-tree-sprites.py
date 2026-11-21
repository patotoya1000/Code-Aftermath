#!/usr/bin/env python3
"""Turn the raw tree pictures (assets/source/trees/, as drawn: 412x512 canvases) into the game's tree sprites under assets/sprites/nodes/.
One-off art tooling, not part of the game runtime. Needs: pip install pillow numpy scipy.

  tree_<family>_full<n>.png / tree_green_full_2.jpg  ->  tree_<family>_full_<n>.png   (family: green, spring, autumn, winter; n: 1, 2)
  tree_cut_<n>.png                                   ->  tree_cut_<n>.png              (the felled tree / stump, shared by every family)

Steps: a picture without transparency (the green tree 2 is a JPG on white) gets its white background removed; every picture is trimmed to its
visible pixels; then ALL of them are scaled by ONE factor so the widest tree is REF_W px wide (a stump stays smaller than its tree). The sizes are merged
into sizes.json. Keep REF_W here equal to REF_W.tree in src/modules/assets/nodeart.js (a test checks it)."""
import json, os, re, glob
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source', 'trees'); OUT = os.path.join(ROOT, 'assets', 'sprites', 'nodes')
REF_W = 256  # width in pixels of the widest tree sprite

def knock_out_white(im):
    """Make the white background of an opaque picture transparent: every large white region (also pockets between leaves) goes, and the
    anti-aliased fringe next to it is faded by how white it is, so no white halo is left around the leaves."""
    a = np.array(im.convert('RGB')).astype(int); white = a.min(axis=2)
    lab, n = ndi.label(white >= 238)
    sizes = ndi.sum(np.ones_like(white), lab, range(1, n + 1))
    bg = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 40])
    near = ndi.binary_dilation(bg, iterations=2) & ~bg
    alpha = np.where(bg, 0, 255).astype(float)
    fringe = np.clip((250 - white) / 60.0, 0, 1) * 255  # whiter -> more transparent
    alpha[near] = np.minimum(alpha[near], fringe[near])
    rim = (alpha > 0) & ~ndi.binary_erosion(alpha > 0, iterations=1)  # the outermost pixel row still carries a light fringe: make it half see-through
    alpha[rim] *= 0.4
    out = np.dstack([a.astype(np.uint8), alpha.astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')

def load(path):
    im = Image.open(path)
    if im.mode == 'RGBA' and np.array(im)[..., 3].min() < 255: return im
    return knock_out_white(im)

def drop_specks(im, grow=6, keep=0.03):
    """Remove stray bits (loose leaves, dust, JPEG noise) that would widen the trimmed picture: keep only the blobs that are at least `keep` of the biggest one."""
    arr = np.array(im); a = arr[..., 3] > 12
    lab, n = ndi.label(ndi.binary_dilation(a, iterations=grow))
    if n < 2: return im
    area = ndi.sum(a, lab, range(1, n + 1)); ok = [i + 1 for i, v in enumerate(area) if v >= keep * area.max()]
    arr[~np.isin(lab, ok)] = 0
    return Image.fromarray(arr, 'RGBA')

def trim(im):
    im = drop_specks(im)
    box = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    return im.crop(box)

def main():
    jobs = {}  # output name -> source path
    for p in sorted(glob.glob(os.path.join(SRC, 'tree_*'))):
        base = os.path.splitext(os.path.basename(p))[0]
        m = re.fullmatch(r'tree_(green|spring|autumn|winter)_full_?(\d)', base)
        if m: jobs[f'tree_{m.group(1)}_full_{m.group(2)}'] = p; continue
        m = re.fullmatch(r'tree_cut_(\d)', base)
        if m: jobs[f'tree_cut_{m.group(1)}'] = p
    pics = {name: trim(load(p)) for name, p in jobs.items()}
    widest = max(im.width for n, im in pics.items() if '_full_' in n)
    k = REF_W / widest
    os.makedirs(OUT, exist_ok=True)
    sizes_path = os.path.join(OUT, 'sizes.json')
    meta = json.load(open(sizes_path)) if os.path.exists(sizes_path) else {}
    meta = {n: v for n, v in meta.items() if not n.startswith('tree_')}  # drop the old tree entries
    for name, im in sorted(pics.items()):
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.png'), optimize=True)
        meta[name] = {'w': im.width, 'h': im.height}
    with open(sizes_path, 'w') as f: json.dump(meta, f, indent=1)
    print(len(pics), 'tree sprites ->', OUT, '(REF_W', REF_W, ')')

if __name__ == '__main__': main()
