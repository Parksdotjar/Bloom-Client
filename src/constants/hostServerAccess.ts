export const HOST_SERVERS_UNLOCK_KEY = 'bloom_host_servers_unlocked';
export const HOST_SERVERS_UNLOCK_EVENT = 'bloom-host-servers-unlock-change';
export const HOST_SERVERS_SECRET_PHRASE = 'petals power the server rack';

export function readHostServersUnlocked() {
  return localStorage.getItem(HOST_SERVERS_UNLOCK_KEY) === 'true';
}

export function setHostServersUnlocked(next: boolean) {
  localStorage.setItem(HOST_SERVERS_UNLOCK_KEY, next ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(HOST_SERVERS_UNLOCK_EVENT, { detail: { unlocked: next } }));
}
