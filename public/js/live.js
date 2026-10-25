// Live updates over server-sent events. The stream carries only "something changed" signals;
// views refetch through the normal authorised API. EventSource reconnects on its own after drops.
let source = null;
const handlers = new Map(); // type -> Set<{ fn, scoped }>

export function connectLive() {
  if (source) return;
  source = new EventSource('/api/events');
  for (const type of ['notification', 'message', 'project']) {
    source.addEventListener(type, (e) => {
      let data = {};
      try { data = JSON.parse(e.data); } catch { /* ignore */ }
      handlers.get(type)?.forEach((h) => h.fn(data));
    });
  }
}

export function disconnectLive() {
  source?.close();
  source = null;
}

// Scoped handlers belong to the current page and are dropped on navigation.
export function onLive(type, fn, { scoped = true } = {}) {
  const set = handlers.get(type) || new Set();
  const entry = { fn, scoped };
  set.add(entry);
  handlers.set(type, set);
  return () => set.delete(entry);
}

export function clearScopedLive() {
  for (const set of handlers.values()) for (const h of set) if (h.scoped) set.delete(h);
}
