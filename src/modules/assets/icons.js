// Item icons: the equipment pictures (assets/equipments/*.png, 250x250, transparent). Presentation only: the UI asks "which picture shows item X?" and gets a URL
// (or null, so the row keeps showing text only). An id here does not make the item exist in the game: weapons that exist in the definitions
// (spear, bow, crossbow, rifle) show their icon today; the tools and the survivor's gear (boots, helmet, jacket, mask, bag) are ready for when they are defined
// (docs/game/22 cold-weather protection) - until then nothing in the game carries those ids, so nothing shows them.

export const ICON_DIR = 'assets/equipments/';
/** item id -> picture file stem. The ids of weapons are the ids in data/items.js and data/arsenal.js; the gear ids are the file names. */
export const ITEM_ICONS = Object.freeze({
  spear: 'makeshift_spear', bow: 'bow', crossbow: 'common_crossbow', rifle: 'common_rifle',
  axe: 'axe', pickaxe: 'pickaxe', repair_tool: 'repair_tool',
  survival_boots: 'survival_boots', survivor_helmet: 'survivor_helmet', survivor_jacket: 'survivor_jacket', survivor_mask: 'survivor_mask', survivor_bag: 'survivor_bag',
});
/** Every picture file stem (a test checks that each exists as a PNG and that each one has an item id). */
export const ICON_FILES = Object.freeze([...new Set(Object.values(ITEM_ICONS))]);

export const hasIcon = (itemId) => Object.hasOwn(ITEM_ICONS, itemId);
/** URL of the icon for an item id, or null when it has none. */
export const iconUrl = (itemId) => (hasIcon(itemId) ? `${ICON_DIR}${ITEM_ICONS[itemId]}.png` : null);
