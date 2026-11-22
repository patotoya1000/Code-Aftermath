// Shared card state & formatting helpers (presentation only).
// Normalizes entity states (normal, loading, empty, damaged, ruined, away, destroyed, unavailable)
// so every card uses one consistent vocabulary without inventing gameplay rules.

export const CARD_STATES = Object.freeze([
  'normal',
  'loading',
  'empty',
  'damaged',
  'ruined',
  'away',
  'destroyed',
  'unavailable',
]);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const cap = (s) => {
  const str = String(s ?? '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
};

export const pct = (val, max) => {
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(val || 0) / Number(max)) * 100)));
};

export const toneFor = (percent, { invert = false } = {}) => {
  const p = Number(percent);
  if (!Number.isFinite(p)) return 'muted';
  if (invert) return p >= 80 ? 'bad' : p >= 50 ? 'warn' : 'good';
  return p < 25 ? 'bad' : p < 60 ? 'warn' : 'good';
};

/**
 * Derive a normalized card state from an entity projection.
 * Never invents rules; reads explicit projection fields only.
 */
export function cardStateOf(entity, { loading = false } = {}) {
  if (loading) return 'loading';
  if (!entity) return 'empty';
  if (entity.status === 'dead' || entity.destroyed === true || entity.alive === false) return 'destroyed';
  if (entity.status === 'away') return 'away';
  if (entity.condition === 'ruined') return 'ruined';
  if (entity.status === 'downed' || entity.condition === 'damaged') return 'damaged';
  if (Number.isFinite(entity.health) && Number.isFinite(entity.maxHealth) && entity.maxHealth > 0) {
    if (entity.health <= 0) return 'destroyed';
    if (entity.health < entity.maxHealth) return 'damaged';
  }
  if (Number.isFinite(entity.amount) && entity.amount <= 0) return 'empty';
  if (entity.available === false || entity.open === false) return 'unavailable';
  return 'normal';
}

const DEFAULT_NOTICES = Object.freeze({
  loading: 'Loading projection data…',
  empty: 'Nothing to show here yet.',
  damaged: 'Damaged: repair or tend to restore full condition.',
  ruined: 'Ruined: repair it before using or upgrading it.',
  away: 'Away on expedition: commands are unavailable until return.',
  destroyed: 'Destroyed: no longer active in the world.',
  unavailable: 'Currently unavailable.',
});

export function stateNotice(state, customText = '') {
  if (!state || state === 'normal') return null;
  const text = customText || DEFAULT_NOTICES[state] || '';
  if (!text) return null;
  const tone = state === 'ruined' || state === 'destroyed' ? 'bad' : state === 'damaged' || state === 'away' ? 'warn' : 'muted';
  return { state, tone, text };
}

export function isActionAllowedInState(state) {
  return state !== 'loading' && state !== 'away' && state !== 'destroyed';
}
