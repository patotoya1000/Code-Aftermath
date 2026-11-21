#!/usr/bin/env python3
"""Slice the tree/rock concept sheets (assets/source/*.png, transparent background) into one trimmed PNG per sprite
under assets/sprites/nodes/. One-off art tooling, not part of the game runtime. Needs: pip install pillow numpy scipy.
Each sprite is cropped from a hand-set box and trimmed to its visible pixels; each sheet is then scaled by one factor so its largest
sprite's longest side is MAX_SIDE (about 2x the on-screen size at the default zoom; the renderer scales it to the grid)."""
import json, os
from PIL import Image
import numpy as np
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source'); OUT = os.path.join(ROOT, 'assets', 'sprites', 'nodes')
MAX_SIDE = 192  # the largest sprite of each sheet is scaled to this; every other sprite of that sheet uses the SAME factor, so a stump stays smaller than its tree

# name: (sheet, (x1, y1, x2, y2))  -- boxes are in sheet pixels
TREES = {}  # trees are no longer cut from trees-sheet.png: the finished tree pictures are processed by scripts/prepare-tree-sprites.py
ROCKS = {}
rows = [(0, 372), (372, 698), (698, 1024)]
cols = [[(130, 665), (655, 1115), (1115, 1420)]] * 3
for ri, (kind, (y1, y2)) in enumerate(zip(['spire', 'arch', 'slab'], rows)):
    for ci, stage in enumerate(['full', 'worn', 'rubble']):
        x1, x2 = cols[ri][ci]
        ROCKS[f'rock_{kind}_{stage}'] = ('rocks-sheet.png', (x1, y1, x2, y2))

def clean(c, anchor=None, grow=6):
    """Keep only the blob of pixels that is the sprite: the one containing `anchor` (x, y in crop coordinates), else the biggest.
    Nearby chips (rubble, leaves) are kept because blobs are grown by `grow` px before labelling; stray bits of neighbours are dropped."""
    a = np.array(c)[..., 3] > 12
    lab, n = ndi.label(ndi.binary_dilation(a, iterations=grow))
    if anchor:
        ys, xs = np.nonzero(a); i = np.argmin((xs - anchor[0]) ** 2 + (ys - anchor[1]) ** 2); keep = lab[ys[i], xs[i]]
    else:
        keep = 1 + int(np.argmax(ndi.sum(a, lab, range(1, n + 1))))
    arr = np.array(c); arr[(lab != keep) & True] = 0  # outside the chosen blob -> fully transparent
    return Image.fromarray(arr)

def main():
    os.makedirs(OUT, exist_ok=True)
    sheets = {}; cut = {}
    for name, spec in {**TREES, **ROCKS}.items():
        sheet, box = spec[0], spec[1]
        anchor = (spec[2][0] - box[0], spec[2][1] - box[1]) if len(spec) > 2 else None
        grow = spec[3] if len(spec) > 3 else 6
        im = sheets.setdefault(sheet, Image.open(os.path.join(SRC, sheet)).convert('RGBA'))
        c = clean(im.crop(box), anchor, grow)
        cut[name] = (sheet, c.crop(c.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()))
    scale = {sh: min(1.0, MAX_SIDE / max(max(c.size) for n, (s2, c) in cut.items() if s2 == sh)) for sh in sheets}
    meta = {}
    for name, (sheet, c) in cut.items():
        k = scale[sheet]
        if k < 1: c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
        c.save(os.path.join(OUT, name + '.png'), optimize=True)
        meta[name] = {'w': c.width, 'h': c.height}
    sp = os.path.join(OUT, 'sizes.json')  # merge: keep the tree entries written by prepare-tree-sprites.py
    old = json.load(open(sp)) if os.path.exists(sp) else {}
    old.update(meta)
    with open(sp, 'w') as f: json.dump(old, f, indent=1)
    print(len(meta), 'sprites ->', OUT)

if __name__ == '__main__': main()
