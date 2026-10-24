// Hash router: works on refresh and under a GitHub Pages sub-path because the server only ever serves index.html.
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

// Set the hash before committing a role change so the synchronous re-render already sees the new route.
export function navigate(path) {
  const target = `#${path}`;
  if (location.hash === target) window.dispatchEvent(new Event('rerender'));
  else location.hash = target;
}
