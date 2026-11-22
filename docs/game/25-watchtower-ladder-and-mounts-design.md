# 25 - Watchtower ladder and mounted weapons (levels 1-5)

Status: levels 1-5, the five mounts, `shots` and the aiming pictures are BUILT (`SIM_VERSION` 0.44.0). The "extra upgrade ideas" in section 3 are NOT built yet.

## 1. The ladder (the user's spec)

The range grows EVERY level, both for a survivor posted on the tower (`towers[level].rangeBonus`, ranged weapons only) and for the mount the level unlocks.

| Level | Name | Mount unlocked | Range bonus | Health | Slots | What it is |
|---|---|---|---|---|---|---|
| 1 | Survivor Lookout | none (a survivor stands on it) | +1 | 60 | 1 | Elevated wooden platform; boosts range and accuracy of bows, crossbows, rifles |
| 2 | Repeater Ballista Tower | `ballista` (range 8, heavy bolts, high knockback/pierce) | +2 | 100 | 2 | Reinforced tower with a mechanical ballista |
| 3 | Machine Gun Tower | `machine_gun` (range 9, 120 bullets, reload 2) | +3 | 160 | 2 | Armored tower with a mounted heavy machine gun; sustained fire on medium-to-large hordes |
| 4 | Minigun Tower | `minigun` (range 10, 200 bullets, reload 1, grid power only while firing) | +4 | 240 | 2 | Steel fortification with a rotary minigun |
| 5 | Dual Minigun Fortress | `dual_minigun` (range 11, 300 bullets, `shots: 2`, grid power only while firing) | +5 | 360 | 3 | Twin-linked miniguns: 2 projectiles per trigger pull, 2 bullets spent, the grid asked once |

A level can hold every mount of the levels below it (a level 5 tower may carry a ballista beside the dual minigun). The old `repeating_crossbow` was replaced by `machine_gun`.

Upgrade costs (`buildings.tower.upgrade`): L2 wood 20 + stone 15, L3 wood 25 + stone 40 (unchanged), L4 stone 50 + scrap 20, L5 stone 70 + scrap 40 + gland 4. Crafting (workshop level 3, the Armory): machine gun scrap 10 + gland 1 (Crafting 3), minigun scrap 16 + gland 2 (Crafting 4), dual minigun scrap 30 + gland 4 (Crafting 5). Combat skill to equip: machine gun 3, minigun 4, dual minigun 5. All numbers are placeholders to tune in the balance playtest.

Noise: machine gun 9, minigun 12, dual minigun 18 per projectile pull (a mounted weapon is never suppressed), so higher towers are louder bait.

## 2. Pictures and aiming (presentation only)

- `assets/sprites/buildings/tower_level_<1-5>.png` replace the single old tower picture for a working tower. A ruined tower keeps `tower_ruined.png`; a damaged one is the level picture darkened.
- `tower_mount_<ballista|machinegun|minigun|dual_minigun>.png` sit on the round socket of levels 2-5 (`TOWER_SEATS` in `src/modules/assets/towerart.js`, measured in source pixels). Several mounts share a roof, smaller and side by side.
- The simulation says what each mount is aimed at: `mountTarget` (the nearest zombie in its range, ties by id) -> `renderProjection().buildings[].mounts[i].aim` ({ x, y } or null) and, for learner code, `tower.installed[i].aim`.
- The renderer turns the picture: the HEAD (gun, belt, yoke - above `cut`) tilts around `pivot` toward the target (clamped to +-55 degrees) while the BASE stays put; a target on the other side flips the head like a turntable in 200 ms; with no target it levels off and keeps the side it last faced. A short muzzle flash is drawn when the mount fired on the last tick (guns only). None of it feeds back into the simulation.

## 3. Extra ideas (NOT built)

- Searchlight / spotter mount: a rotating spotlight that reveals cloaked/night zombies and raises the tower's target lock range.
- Armor-piercing / incendiary rounds: an ammo upgrade for higher tiers (shred armored zombies, ignite hordes).
- Reinforced tower base: more tower HP, melee zombies cannot knock it down quickly.
- Ammo hopper / auto-loader: less reload downtime on the ballista, machine gun and minigun tiers.
- High-ground priority targeting: toggle Closest, Strongest/Mutated, or Ranged/Spitter first (today a mount always shoots the nearest zombie in range).
