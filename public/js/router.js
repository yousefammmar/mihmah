// Hash router: the server only serves index.html, so every route works on refresh.
const routes = [];

export function route(pattern, def) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ re, keys, ...def });
}

export function parse() {
  const raw = location.hash.startsWith('#/') ? location.hash.slice(1) : '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(qs) };
}

export function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

// Re-renders the current page in place (keeps scroll and focus). app.js registers the renderer.
let renderer = null;
export const setRenderer = (fn) => { renderer = fn; };
export const refresh = () => renderer?.();

export function navigate(path) {
  const target = `#${path}`;
  if (location.hash === target) window.dispatchEvent(new Event('rerender'));
  else location.hash = target;
}
