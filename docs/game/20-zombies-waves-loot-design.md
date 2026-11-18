# 20. Zombies, Waves, Loot, Weapons and Towers (DESIGN — decided 2026-11-18; implemented through Z6b, see sections 16-20)

> Supersedes the "ENEMY — OPEN" section of [14](14-enemies-resources-items-open.md) for gameplay (sprites/animation-state lists there stay open).
> Builds on the O19 groundwork: `threats` module, `data/threats.js`, abstract dusk raids. Every number below is a PLACEHOLDER to tune.

## 1. Principles

1. Each zombie type tests ONE thing in the learner's code (target priority, reaction to warnings, ranged defence...).
2. Everything stays a pure function of (seed, day) + deterministic simulation. No stored randomness.
3. Movement before combat; special types last. Leave room for more tiers/types (see 8).

## 2. Wave rules (decided)

- Zombies target **any survivor outside the wall first**; if none, they go for the fence / gate.
- **Survivors must be inside the wall during a wave** (mandatory). Anyone outside is the first victim.
- During a wave survivors **protect** (repair, guard post) or **attack** (from inside, at the fence line / ranged).
- Lifecycle: `warning` (2 days ahead, composition revealed) → `dusk: wave starts` → `fight` → `clear` → `dawn: sortie window` (loot).
- Raid strength budget (existing `raidSchedule`) is still spent on zombies by `threat` cost; day gates decide which types are available.

## 3. Types (kept: 7)

| Type | Behaviour | Tests | Threat | First day |
|---|---|---|---|---|
| Common (walker) | Walks to target, hits it | basic guard/repair loop | 2 | 6 |
| Runner | Fast, fragile | reacting to the warning, prep | 3 | 9 |
| Boomer | Flat armor; **explodes on contact with fence/wall, with a RADIUS** | target priority, kill before contact | 5 | 12 |
| Thrower | Ranged; hits wall segments from distance; thrown objects land as rubble | sortie / ranged defence | 5 | 15 |
| Screamer | No attack; scream (cooldown) calls extra zombies, capped | kill the cheap unit first | 4 | 18 |
| Tank (today's brute) | Slow, huge HP, heavy wall damage | focus fire, upgraded fence | 8 | 21 |
| Boss | Fixed milestone, multi-phase, escorts, announced early | everything | own slot | 25, then every ~10 days |

- **Armor** = flat damage reduction (damage − armor, min 0), not extra HP. Gates weapon tiers.
- **Boomer explosion**: radius (placeholder 2 cells) damages fence/wall segments AND survivors inside it. A boomer that explodes **drops no loot**; killed before contact it drops its gland.
- **Screamer**: summons capped per scream (placeholder 3) and per wave; cooldown; summoned zombies counted against the wave cap.
- **Thrower rubble**: each throw leaves rubble outside the wall; survivors can gather it into stone (sortie).
- **Boss**: fixed schedule, so learners can see it coming; unique drop (blueprint/core).

## 4. Loot (decided: collected by SORTIE)

Type decides WHAT drops; zombie level/tier decides HOW MUCH and how rare.

| Drop | Source | Use |
|---|---|---|
| Bones | common, tank | bone meal → better fertilizer / nutrients (optional upgrade of the O15/O17 chain, farming must still work without it) |
| Hide / leather | runner, tank | workshop: bags (carry), armor, gloves |
| Rags / cloth | common | bandages, `packaging` (MRE sealing) |
| Scrap metal | thrower | fence upgrades, traps, weapons |
| Volatile gland | boomer (not exploded) | explosive traps, advanced fuel |
| Rare drop | screamer | noise lure |
| Boss core / blueprint | boss | top-tier recipe or building level |

- Loot lies on the ground where the zombie died (outside the wall). A survivor must go out through the gate and pick it up (`gather`-style action + pathing + carry/deposit).
- Sorties are only allowed when no wave is active (after `clear`).

## 5. Boundaries (do not break)

- No hidden combat side effects in existing actions; combat gets its own commands (`survivor.attack`, guard post).
- Renderer/UI never write state; learner code only through the API.
- No turns (ADR-001).

## 6. Build order

1. Taxonomy + data tables (this doc → `data/threats.js` validated definitions).
2. Zombie ENTITIES walk (A* pathing) and hit the fence/gate; targeting rule (outside survivors first). No survivor damage yet.
3. Survivor damage, recall rule, `attack`/guard commands, wave lifecycle.
4. Loot drops on the ground + sortie pickup.
5. Special types one at a time: runner → boomer → thrower → screamer → tank → boss.

## 7. Resolved questions (2026-11-18)

- **"Inside the wall" is the learner's responsibility.** The simulation does NOT auto-recall. Forgetting a survivor outside means losing them first. The `raid.warning` event is the hook learners use (lesson: event handling).
- **The gate closes during a wave** and becomes a wall piece with its own health, so zombies cannot walk in. Sorties are only possible after `clear`.
- **Loot stays on the ground until the next dawn** after the wave is cleared (placeholder: despawn at dawn + 1 day). Tunable.
- **Attacking from inside depends on the survivor's equipped weapon** (see 9): reach decides whether they can hit a zombie across the fence, or need a tower/ranged weapon.

## 8. Room for expansion

Zombie definitions are data rows with `tier`; armored/elite variants of existing types and new types are added as rows + a behaviour tag, not new code paths.

## 9. Weapons (decided: equipment-driven; ladder PROPOSED)

Decided: every starter survivor carries a **spear or knife**. Crafting then unlocks a ladder: advanced spear -> bow and arrow -> crossbow -> rifle -> more later. What a survivor can do in a wave depends on the weapon they hold.

| Tier | Weapon | Reach | Needs | Notes (placeholders) |
|---|---|---|---|---|
| 0 | Knife (starter) | just across the fence | none | fast, weak; 0 damage vs heavy armor |
| 0 | Spear (starter) | one cell further than a knife | none | the first weapon that can hit over the fence |
| 1 | Advanced spear | like spear | workshop L1: wood + scrap (+ hide grip) | more damage, small armor pierce |
| 2 | Bow + arrows | ranged | workshop L1: wood + hide/rags (string) | arrows are an **ammo item** (wood + scrap tip) |
| 3 | Crossbow + bolts | ranged, longer | workshop L2: wood + scrap | slower reload, high armor pierce (answer to boomer/tank) |
| 4 | Rifle + bullets | longest | workshop L3: scrap + volatile gland (gunpowder) | strong, but **loud**: its shots raise the wave's attention (see open questions) |

Rules:
- Armor is flat reduction (see 3): the ladder exists partly to answer armored types.
- Ammo is an inventory/base-stock item (no spoilage). Running out is a planning problem for the learner's code, not a silent failure: the action fails with a stop reason (e.g. `NO_AMMO`).
- Combat gets its own commands (`survivor.attack`, guard post / `survivor.guard`); no hidden combat inside existing actions. A new `combat` skill uses the existing XP system (O4); higher tiers need a minimum combat skill and a workshop level (reuses recipe `stationLevel`/`minSkill`).
- Weapons have simple durability; repairing at the workshop reuses the repair/craft machinery.
- Loot feeds the ladder on purpose (hide -> grips/strings, scrap -> blades/bolts, gland -> gunpowder): killing zombies well makes better weapons.

## 10. Towers (decided: fence evolves into towers; details PROPOSED)

Decided: the fence can evolve into a **tower**, and the tower level alters the range of ranged weapons.

Proposal (to confirm): towers are **separate defensive buildings on the fence line** (like the gate), not the whole fence turning into one tower. The fence keeps its level (wall HP/defence); a tower is an upgradeable post attached to it.

| Tower level | Effect on a survivor posted on it | Capacity |
|---|---|---|
| 1 Lookout (wood) | +1 range for ranged weapons; can see zombies earlier | 1 |
| 2 Guard tower (stone) | +2 range; ranged weapons only (no melee reach gain) | 2 |
| 3 Fortified tower | +3 range, resists thrower damage better | 2 |

- A survivor must be **posted** on the tower (`survivor.guard(tower)`): the learner decides who stands where.
- Tower range is a bonus added to the weapon's own range, so a rifle on a level-3 tower outranges the thrower, and a knife on a tower gains nothing.
- Towers can be damaged (boomer radius, thrower). A ruined tower loses its bonus and its posted survivors are exposed. Towers are placed off the gate and off each other (layout validation like footprints).
- Built like everything else: starts as a ruin in the scenario, is repaired, then upgraded (no free construction, ADR in DECISIONS).

## 11. Updated build order

1. Data tables + validation (types, weapons, ammo, towers as definitions).
2. Zombie entities walk and hit the fence/gate; targeting rule; gate closes during a wave.
3. Survivor damage, equipment/reach, `attack`/`guard`, wave lifecycle, `NO_AMMO`.
4. Loot on the ground + sortie pickup.
5. Weapon crafting ladder (spear -> bow -> crossbow -> rifle) + combat skill.
6. Towers.
7. Special types one at a time: runner -> boomer -> thrower -> screamer -> tank -> boss.

## 12. Resolved (2026-11-18, second round)

- **Rifle is LOUD (decided).** Noise is a real mechanic (see 13).
- **Towers host weapons (decided).** Besides giving range to a posted survivor's own weapon, a tower can mount a heavier weapon that scales with tower level, ending in a minigun (see 13).
- **Ammo is carried by the survivor (decided).** Resupply is a task in the learner's code. Mounted weapons use a hopper stocked by survivors (see 13).

## 13. Mounted weapons, noise and power (PROPOSED — to confirm)

### 13.1 Mounted weapons on towers

A tower slot holds EITHER a posted survivor with their personal weapon (gets the tower's range bonus, section 10) OR a mounted weapon that a posted survivor operates. Which weapons can be mounted depends on the tower level:

| Tower level | Mountable | Notes (placeholders) |
|---|---|---|
| 1 Lookout | none (personal weapon + range bonus only) | |
| 2 Guard tower | Mounted crossbow (ballista) | big pierce, slow reload, quiet |
| 3 Fortified tower | Repeating crossbow, then Minigun | minigun: very high fire rate, loud, **needs power** and a big ammo hopper |

- A mounted weapon has a **hopper** (ammo store). Survivors fill it from carried ammo (`survivor.reload(tower)`); an empty hopper stops fire with `NO_AMMO`.
- The operator is mandatory: no survivor posted, no fire. A ruined tower stops all of it.
- Mounted weapons are crafted at the workshop (higher station level + combat skill) and installed on a tower like an upgrade.

### 13.2 Power for the minigun

The minigun is a consumer on the existing power grid (generator, solar, battery from O11/O14), like the freezer and pump. No power = no spin-up = no fire. Battery storage lets it fire at night or in a storm. This makes the earlier power work matter for defence, and gives the learner a trade-off: power for hydroponics/freezer versus power for the minigun.

### 13.3 Noise

- Every shot adds **noise**; weapons have a noise value (bow/crossbow ~0 to low, rifle high, minigun very high).
- Noise sums into a wave **attention** meter that decays over time. Past a threshold the wave gets reinforcements (extra zombies, capped and counted against the wave cap, like screamer summons).
- Zombies also **drift toward the loudest tower**, so a learner can use a noisy tower as bait while quiet weapons cover the rest.
- The screamer's rare drop (noise lure) lets a learner place noise on purpose. A suppressor (scrap + rags) lowers a personal weapon's noise.
- Learner API: read `threats.noise` (current attention) so code can switch weapons or stop firing.

### 13.4 Progression pacing (zombie day gates vs answers)

| Day | New threat | The answer arrives |
|---|---|---|
| 6 | common | knife / spear |
| 9 | runner | advanced spear, bow |
| 12 | boomer | crossbow (pierce, kill it before contact) |
| 15 | thrower | tower L2 + mounted crossbow (outranges it) |
| 18 | screamer | rifle (kill the fragile caller fast, at the cost of noise) |
| 21 | tank | repeating crossbow / early minigun |
| 25 | boss | minigun + power + ammo logistics together |

### 13.5 Example learner code (to check the API feel)

```js
// onRaidWarning: composition is public 2 days ahead
const wave = threats.upcoming[0];
if (wave.types.boomer > 0) mara.craft("bolts", 30);
mara.guard("tower_east");            // post the best shooter
bob.reload("tower_east", "bolts", 20); // keep the hopper stocked
```

### 13.6 Later ideas (not in scope now)

Traps and barricades as a cheap layer before the fence (spike pit, explosive trap from boomer glands); ammo types (armor-piercing); weapon durability repair at the workshop. All fit as data rows.

## 14. Resolved (third round, 2026-11-18)

- A tower slot holds EITHER a posted survivor OR a mounted weapon (towers have 1/2/2 slots by level).
- Noise is BOTH a global attention meter and drift toward the loudest tower.
- The minigun draws grid power only while firing (batteries matter).

## 15. Implementation phases

| Phase | Content | Status |
|---|---|---|
| Z1 | Data tables + validation: zombies (role/armor/firstDay/behaviour), bosses + `bossSchedule`, `waveRules`, `lootTables`, loot/ammo items, `weapons`, `towers`, `noise`; day-gated abstract raids; pure helpers; learner `threats` read; `SIM_VERSION` 0.24.0 | DONE (2026-11-18) |
| Z2 | Zombie entities walk (A*) and hit the fence/gate; outside survivors first; gate closes during a wave; no survivor damage yet | DONE (2026-11-18, `SIM_VERSION` 0.25.0) |
| Z3 | Survivor damage, equipment + reach, `survivor.attack`/`guard`, wave lifecycle, `NO_AMMO` | DONE (`SIM_VERSION` 0.26.0, 2026-11-18) |
| Z4 | Loot on the ground + sortie pickup (lingers until `lootLingerDays`), carried ammo | DONE (`SIM_VERSION` 0.27.0, 2026-11-18; see section 17) |
| Z5 | Weapon + ammo recipes (workshop), `combat` skill, bone meal as a better fertilizer | DONE (`SIM_VERSION` 0.28.0, 2026-11-18; see section 18) |
| Z6 | Towers as buildings (ruin -> repair -> upgrade), posting, mounts + hopper + `survivor.reload`, minigun power draw, noise meter + drift + reinforcements | SPLIT: Z6a towers + posting + range bonus DONE (`SIM_VERSION` 0.29.0, section 19); Z6b mounts + hopper + reload + minigun power DONE (`SIM_VERSION` 0.30.0, section 20); Z6c noise DONE (`SIM_VERSION` 0.31.0, section 21) |
| Z7 | Special types one at a time: runner -> boomer (radius explosion) -> thrower (rubble) -> screamer -> tank -> boss | PLANNED |

Z1 note: the old abstract dusk raid still resolves by strength vs fence defence; from Z1 its composition only uses types whose `firstDay` has come. Ids keep the O19 names (walker = common, brute = tank).

## 16. Z2 as built (interim rules until Z3 adds combat)

- **Wave lifecycle:** `raid.warning` (2 days ahead) -> **dusk** `wave.started` (gate closes) -> zombies spawn one every `spawnEveryTicks` on ONE map edge (side and spot from seed + day, spread a little along it) -> they walk and hit -> **dawn** the wave retreats, `raid.resolved` + `wave.ended`, the gate opens. State: `state.threats = { history, wave, zombies, counter }`.
- **Targeting:** the nearest survivor OUTSIDE the fence first (any survivor once a wall is breached); otherwise the nearest wall cell (the fence perimeter, or the closed gate). A survivor is only REACHED (`zombie.reached_survivor`); no damage until Z3.
- **Movement:** A* (same pathing as survivors; the closed gate blocks both sides; a fence at 0 health no longer blocks zombies). A zombie moves every `floor(zombieStepTicks / speed)` ticks (runner = every tick, others every 2).
- **Wall damage:** every `attackEveryTicks` a zombie standing against a wall hits it for `damage - wallArmorPerLevel x level` (at least 0). A level 1 fence stops 1 damage per hit, level 2 stops 2 (walkers become harmless). The fence and the gate are separate health pools; the fence is still one building (per-segment damage and the boomer radius come with Z7).
- **Outcome:** a wall reaching 0 health = `wall.breached` -> **breached** (`breached.lootPercent` % of the available food and water lost at dawn); otherwise **repelled**. `fenceDamage` in the history is the real damage dealt. `defenseOf` stays only as an informational rating (`threats.defense`).
- **Interim because nobody can fight yet:** zombies cannot be killed, so they retreat at dawn. Z3 replaces this with "the wave ends when its zombies are dead" (or dawn).
- **Not yet:** boomer/thrower/screamer behaviours (they have damage 0, so they only walk to the wall and stand there), survivor damage, loot on the ground, stranded survivors being killed (a survivor outside at dusk is stuck outside with the gate closed; the learner must bring everyone in before dusk - read `threats.wave.active` and `threats.upcoming`).

## 17. Z4 as built (loot, sorties, carried ammo)

- **Drop:** every kill goes through `killZombie`. What drops is `lootFor(defs, seed, day, zombie)`, a pure function (hash of seed, wave day, zombie id, table row) of the zombie type's loot table: `chancePercent` decides whether a row drops, `min..max` how many. It lies on the cell where the zombie died; the same item on the same cell in the same wave merges into one pile. A boomer that exploded (`z.exploded`, not set until Z7) drops nothing that `requires: 'not_exploded'`.
- **Clear opens the gate:** the last zombie of a fully spawned wave dying sets `wave.cleared` and opens the gate at once (`wave.gateClosed = false`), so a sortie can go out the same night. The wave record still ends at dawn (`raid.resolved`, outcome `cleared`).
- **Sortie (`survivor.collect(item?)`):** standing, like gather. Nearest pile (ties by id; optional item filter) -> work `ticksPerUnit` per unit -> pickup limited by what she can carry and what storage has room for -> walk to the nearest working depot -> unload -> repeat. Stop reasons: `NO_LOOT`, `WAVE_ACTIVE` (refused while a wave is on and not cleared; a sortie under way stops the tick the next wave starts and she keeps what she carries - there is no auto-recall), `STORAGE_FULL`, `NO_DEPOT`, `EXHAUSTED`, `NO_PATH`. Pickups practise Gathering. Piles are plain state, not ledger accounts: a pickup takes whatever is still there when the work is done.
- **Lingering:** a pile starts with `expiresDay: null` (its wave is on). At the dawn that ends the wave it gets `expiresDay = dawn day + waveRules.lootLingerDays`; at the dawn of that day it is gone (`loot.expired`). With `lootLingerDays: 0` it is gone at that same dawn. `threats.loot.piles[].daysLeft` shows the countdown (`null` while the wave is on).
- **Carried ammo (`survivor.take(item, amount)`):** one-shot. She walks to the nearest working building that stores the item and moves up to `amount` (1-100) from base stock into her hands, clamped to the free stock and her carry capacity (reserved in the ledger while she walks, given back if cancelled). Perishable food cannot be taken. `deposit()` puts it back. Failures: `INVALID_PARAMS`, `NO_DEPOT`, `INSUFFICIENT_RESOURCE`, `CARRY_FULL`, `EXHAUSTED`, `NO_PATH`. Ranged weapons still spend what she carries (`NO_AMMO` when it is gone).
- **Storage:** the HQ stores the loot items and the three ammo items (the storehouse does not yet).
- **Not yet:** nothing creates ammo until Z5 recipes (only the starting stock a test or scenario gives), no hopper / `survivor.reload` (Z6), thrower rubble (Z7), screamer lure effects, boss core use.

## 18. Z5 as built (weapons, ammo, bone meal)

- **Recipes (workshop):** `advanced_spear` (2 wood + 2 scrap + 1 hide) and `bow` (3 wood + 1 hide + 1 rags) at workshop level 1, `crossbow` (3 wood + 3 scrap) at level 2, all needing Crafting 1 / 1 / 2 (the `weapons.<id>.craft.minSkill`); `arrows` (2 wood + 1 scrap -> 8, level 1), `bolts` (1 wood + 2 scrap -> 6, level 2, Crafting 1); `bone_meal` (2 bones + 1 water -> 2). A test keeps each weapon recipe equal to its `craft` block. The rifle, bullets and the mounted weapons have no recipe: they need workshop level 3 and towers.
- **Weapons are items:** a crafted weapon lands in base stock (HQ storage 4 / 3 per level). `survivor.equip(weapon)` puts one in hand: knife and spear at once, a crafted one from stock after a walk to the storage (reserved, cancel gives it back); the weapon she held goes back into stock if it was crafted. `weapons.<id>.minCombat` (bow 1, crossbow 2, rifle 3) is the lowest Combat skill that may equip it; Combat grows from hits (Z3). Mounted weapons cannot be equipped.
- **Bone meal:** farm `fertilize` spreads bone meal first when any is in stock, otherwise plain fertilizer. Bone meal gives +100 % harvest (fertilizer +50 %); the plot's `fertilized` is `"bone_meal"` (or `true` for plain). Farming works without it.
- **Loop closed:** kill zombies -> `collect` loot -> craft weapons, ammo, bone meal -> `equip` + `take` -> kill better. Not yet: durability, the hopper (Z6), loot for the rifle (gland + workshop 3).

## 19. Z6a as built (watchtowers, posting, range bonus)

- **Building:** `tower` (stage 1: `tower_1`, a ruin at (15,4), just inside the north-east corner of the wall - towers stand inside the wall in this phase, they are not fence pieces). Levels 1-3 (Lookout 60, Guard tower 100, Fortified tower 160 health) mirror the `towers` table in `arsenal.js`; a definitions validation refuses a mismatch. Repair costs 6 wood per action; upgrades cost 20 wood + 15 stone (level 2) and 25 wood + 40 stone (level 3) and need Repair skill 1 like every upgrade.
- **Posting:** a survivor is POSTED when she stands next to (within 1 cell of) a tower that is not ruined and is among its first `slots` active survivors by id (1 / 2 / 2). A damaged tower still works. `survivor.guard(tower_1)` walks her there and keeps her there.
- **Range:** `effectiveRange(defs, weapon, postedLevel)` is the one place weapon reach is computed: a posted survivor's RANGED weapon reaches `rangeBonus` (1 / 2 / 3) cells further; melee reach never changes. `attack` and `guard` both use it, so a bow on a tower starts hitting zombies earlier.
- **Learner read:** `tower_1.tower = { level, name, slots, rangeBonus, mounts, working, posted }`.
- **Not yet:** zombies do not attack towers, so a tower cannot be damaged or ruined mid-wave; no mounted weapons, hopper, `survivor.reload`, minigun power or noise (Z6b / Z6c); a tower slot is not a reservation (an unposted survivor simply gets no bonus).

## 20. Z6b as built (mounted weapons, hopper, reload, minigun power)

- **Crafting:** `ballista` (workshop 2), `repeating_crossbow` and `minigun` (workshop 3) are recipes that mirror `weapons.<id>.craft` (a definitions validation and `tests/mounts.test.js` keep them equal); each is an item in base stock (HQ storage 2 / 1 per level). `bullets` (2 scrap + 1 gland -> 12, workshop 3, Crafting 2) is the minigun's ammo. The workshop got **level 3, the Armory** (220 health; upgrade 30 wood + 40 stone + 12 scrap, so the zombie loot pays for the heavy tier). The rifle still has no recipe (Z6c).
- **Installing (`survivor.mount(tower, weapon)`):** needs a repaired tower whose level can hold the weapon (`towers[level].mounts`: L2 ballista; L3 ballista, repeating crossbow, minigun), a free slot, and Combat >= `weapons.<id>.minCombat` (2 / 3 / 4). She walks to the storage that holds it, picks it up (`ticks`), hauls it to the tower (no carry-capacity rule for a haul) and fits it (`installTicks`). The unit is reserved when accepted (cancel gives it back) and leaves stock at install. A new mount has an EMPTY hopper. Failures: `INVALID_PARAMS`, `UNKNOWN_TARGET`, `NEEDS_REPAIR`, `TOWER_TOO_LOW`, `NO_SLOT`, `CAPABILITY_INSUFFICIENT`, `EXHAUSTED`, `NO_DEPOT`, `INSUFFICIENT_RESOURCE`, `NO_PATH`. There is no unmount yet.
- **Slots and crew (interpretation of "one slot = survivor OR mounted weapon"):** a tower's `slots` is its total CREW. The posted survivors (section 19, lowest ids first) are the crew; the first M of them (M = installed mounts) are the OPERATORS, one per mounted weapon in install order, and the rest are posted shooters with their personal weapon. A mount therefore uses up one slot. A mount with no operator does not fire. A guarding operator never also fires her personal weapon (`operatorOf`).
- **Hopper and `survivor.reload(tower, ammo, amount?)`:** ammo is carried (`survivor.take`); she walks next to the tower, works `ticks`, and pours it into the hoppers of the installed weapons that use that ammo, in install order, clamped to what she carries, `amount` and the room. `weapons.<id>.hopper` is the capacity (ballista 20, repeating crossbow 40, minigun 200). Failures: `INVALID_PARAMS`, `UNKNOWN_TARGET`, `NEEDS_REPAIR`, `NO_MOUNT`, `NO_AMMO`, `HOPPER_FULL`, `NO_PATH`.
- **Firing (`tickMounts`, after the survivors act and before the wave moves):** every installed mount picks the nearest zombie within its `range` of the tower (no tower range bonus: that is for personal ranged weapons), fires when ready, spends ONE hopper unit, and waits `reload` ticks (a minigun with `reload` 1 fires every tick). Damage = `damage - max(0, armor - pierce)`; the operator gains Combat XP; a kill goes through `killZombie` (loot, wave clear, gate). Status per mount: `READY`, `RELOADING`, `IDLE` (no target), `NO_AMMO`, `NO_OPERATOR`, `NO_POWER`, `BROKEN` (tower ruined). `mount.status` is logged on every change.
- **Power:** a mount whose weapon has `power` (the minigun, 6) is a grid consumer ONLY on ticks it is about to fire. `mountDemands` hands those requests to `tickPower` as extra consumers (served after the buildings and machines): batteries discharge before any generator burns fuel, and a minigun with nothing to shoot draws nothing and burns no fuel. Unpowered = `NO_POWER`, it does not fire (the shot is not spent).
- **Learner read:** `tower_1.tower = { level, name, slots, freeSlots, rangeBonus, mounts (what this level CAN hold), installed: [{ weapon, name, ammo, hopper, hopperMax, range, damage, reload, power?, status, operator }], working, posted }`.
- **Not yet:** zombies do not attack towers, so mounts are never damaged; no noise (Z6c: `weapons.<id>.noise` is still data only); no unmount / swap; mounts use the tower sprite (no gun art).

## 21. Z6c as built (noise, reinforcements, drift, rifle)

- **Noise:** every shot (personal `attack`/`guard`, and every mounted shot) adds `weapons.<id>.noise` to `state.threats.attention`; a shot fired from a tower (a mount, or a survivor posted on it) also adds to that tower's `towerNoise`. Both fall by `noise.decayPerTick` each tick (never below 0). `noise.high` is logged when attention crosses `threshold`.
- **Reinforcements (`tickNoise`):** while a wave is on and not cleared, `min(reinforceCap, floor((attention - threshold) / reinforceEvery))` extra WALKERS have joined it; new ones are appended to the spawn queue (`wave.reinforced`, `wave.reinforced` counts them per wave; event `wave.reinforced`) and counted in the wave composition. At exactly the threshold nothing happens. A wave is not cleared while reinforcements are still queued.
- **Drift:** when no survivor is outside to chase, `noise.driftToLoudest` makes a zombie target the wall cell nearest the LOUDEST tower (highest `towerNoise`, ties by id) instead of the wall nearest itself. Survivors outside still come first.
- **Rifle:** now craftable (item, HQ storage, recipe mirrors `weapons.rifle.craft`: workshop 3, Crafting 3, 6 scrap + 1 gland); `survivor.equip("rifle")` needs Combat 3.
- **Learner read:** `threats.noise = { ...config, attention, loudest, reinforced }`.
- **Not yet:** the suppressor (item + equip effect; `shotNoise(..., suppressed)` still exists as a pure helper), the screamer's noise lure, per-wave cap sharing with screamer summons (Z7), noise from boomer explosions.

