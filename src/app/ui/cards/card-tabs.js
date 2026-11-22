// Shared card tab bar & keyboard navigation helpers (presentation only).
import { esc } from './card-state.js';

export function normalizeTab(tabs = [], activeTab = '') {
  if (!tabs.length) return '';
  return tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0].id;
}

export function renderTabBar(tabs = [], activeTab = '', { action = 'card-tab', ariaLabel = 'Card tabs', className = 'uc-tabs' } = {}) {
  if (!tabs.length) return '';
  const active = normalizeTab(tabs, activeTab);
  return `<div class="${esc(className)}" role="tablist" aria-label="${esc(ariaLabel)}">${tabs.map((t) => {
    const on = t.id === active;
    return `<button type="button" role="tab" class="uc-tab${on ? ' on active' : ''}" aria-selected="${on}" tabindex="${on ? '0' : '-1'}" data-action="${esc(action)}" data-tab="${esc(t.id)}">${esc(t.label)}</button>`;
  }).join('')}</div>`;
}

export function sectionsForTab(sections = [], activeTab = '', tabs = []) {
  if (!tabs.length || !activeTab) return sections;
  const active = normalizeTab(tabs, activeTab);
  return sections.filter((s) => !s.tab || s.tab === active);
}

/**
 * Keyboard handler for any ARIA tablist: ArrowLeft/ArrowUp/ArrowRight/ArrowDown/Home/End.
 * Returns the newly selected tab id or null if the key was not a tab navigation key.
 */
export function nextTabFromKey(tabs = [], currentTab = '', key = '') {
  if (!tabs.length) return null;
  const idx = Math.max(0, tabs.findIndex((t) => t.id === currentTab));
  if (key === 'ArrowRight' || key === 'ArrowDown') return tabs[(idx + 1) % tabs.length].id;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return tabs[(idx - 1 + tabs.length) % tabs.length].id;
  if (key === 'Home') return tabs[0].id;
  if (key === 'End') return tabs[tabs.length - 1].id;
  return null;
}
