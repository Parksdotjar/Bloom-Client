export const COSMETICS_MOD_MENU_EVENT = 'bloom-cosmetics-mod-menu';
export const COSMETICS_MOD_MENU_REQUEST_KEY = 'bloom_cosmetics_mod_menu_request';

export function requestCosmeticsModMenuOpen() {
  const stamp = String(Date.now());
  sessionStorage.setItem(COSMETICS_MOD_MENU_REQUEST_KEY, stamp);
  window.dispatchEvent(new CustomEvent(COSMETICS_MOD_MENU_EVENT, { detail: { stamp } }));
}

export function consumeCosmeticsModMenuRequest() {
  const stamp = sessionStorage.getItem(COSMETICS_MOD_MENU_REQUEST_KEY);
  if (!stamp) return null;
  sessionStorage.removeItem(COSMETICS_MOD_MENU_REQUEST_KEY);
  return stamp;
}
