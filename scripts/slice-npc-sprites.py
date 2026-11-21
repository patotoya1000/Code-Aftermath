#!/usr/bin/env python3
"""Slice the matryoshka survivor concept sheets (assets/source/npc-sheet.png, npc-walk-sheet.png, transparent background) into one trimmed PNG per
pose under assets/sprites/npc/, plus sizes.json {name: {w, h, ax}}. One-off art tooling, not part of the game runtime. Needs: pip install pillow numpy scipy.
All sprites share ONE scale factor (SCALE), so a tool pose is exactly as big as the idle pose. `ax` = the horizontal foot anchor in the trimmed picture
(centre of mass of the lower body), so the renderer can stand every pose on the same spot even when an arm, a tool or a stride sticks out sideways.
The bottom edge of each picture is the foot line (lying poses: the ground line)."""
import json, os
from PIL import Image
import numpy as np
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source'); OUT = os.path.join(ROOT, 'assets', 'sprites', 'npc')
SCALE = 0.5   # idle pose is ~237 px tall on the sheet -> ~118 px here (about 2x the on-screen size at the default zoom)

# name: (sheet, seed point inside the sprite, in sheet pixels)
SHEETS = {
  'idle_down':  ('npc-sheet.png', (128, 140)),  'idle_up':    ('npc-sheet.png', (384, 140)),
  'idle_left':  ('npc-sheet.png', (648, 140)),  'idle_right': ('npc-sheet.png', (888, 140)),
  'tool_axe':   ('npc-sheet.png', (140, 420)),  'tool_pickaxe': ('npc-sheet.png', (400, 420)),
  'tool_spear': ('npc-sheet.png', (650, 420)),  'tool_bow':   ('npc-sheet.png', (880, 420)),
  'tool_crossbow': ('npc-sheet.png', (140, 660)), 'tool_rifle': ('npc-sheet.png', (400, 660)),
  'tool_wrench': ('npc-sheet.png', (640, 660)),
  'downed':     ('npc-sheet.png', (900, 690)),  'dead':       ('npc-sheet.png', (120, 930)),
  'walk_down_0': ('npc-walk-sheet.png', (128, 130)), 'walk_down_1': ('npc-walk-sheet.png', (384, 130)),
  'walk_up_0':   ('npc-walk-sheet.png', (640, 130)), 'walk_up_1':   ('npc-walk-sheet.png', (896, 130)),
  'walk_left_0': ('npc-walk-sheet.png', (128, 390)), 'walk_left_1': ('npc-walk-sheet.png', (384, 390)),
  'walk_right_0': ('npc-walk-sheet.png', (640, 390)), 'walk_right_1': ('npc-walk-sheet.png', (896, 390)),
}

WHITE_KEY = {'tool_bow'}
os.makedirs(OUT, exist_ok=True)
cache = {}
def load(sheet):
    if sheet not in cache:
        im = Image.open(os.path.join(SRC, sheet)).convert('RGBA'); a = np.array(im)
        lab, _ = ndi.label(ndi.binary_dilation(a[:, :, 3] > 20, iterations=6))   # grown so loose bits (straps, a bandage end) stay with their body
        cache[sheet] = (a, lab)
    return cache[sheet]

sizes = {}
for name, (sheet, (sx, sy)) in SHEETS.items():
    a, lab = load(sheet)
    l = lab[sy, sx]
    assert l > 0, f'{name}: seed point is not on a sprite'
    m = (lab == l) & (a[:, :, 3] > 0)
    ys, xs = np.where(m & (a[:, :, 3] > 20)); x1, x2, y1, y2 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    c = a.copy(); c[~m] = 0; c = c[y1:y2, x1:x2]
    if name in WHITE_KEY: c[(c[:, :, :3].min(axis=2) > 235)] = 0   # the bow's inside was painted opaque white on the concept sheet
    h, w = c.shape[:2]
    low = c[int(h * 0.55):, :, 3] > 20; lx = np.where(low)[1]
    ax = float(lx.mean()) if len(lx) else w / 2
    nw, nh = max(1, round(w * SCALE)), max(1, round(h * SCALE))
    Image.fromarray(c).resize((nw, nh), Image.LANCZOS).save(os.path.join(OUT, name + '.png'))
    sizes[name] = {'w': nw, 'h': nh, 'ax': round(ax * SCALE, 1)}
json.dump(sizes, open(os.path.join(OUT, 'sizes.json'), 'w'), indent=1)
print(len(sizes), 'sprites', {k: (v['w'], v['h']) for k, v in sizes.items()})
