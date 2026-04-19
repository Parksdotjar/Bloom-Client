export const BUD_ENABLED_KEY = 'bloom_bud_enabled';
export const BUD_SETTINGS_CHANGE_EVENT = 'bloom-bud-settings-change';

export function readBudEnabled(): boolean {
  return localStorage.getItem(BUD_ENABLED_KEY) !== 'false';
}
