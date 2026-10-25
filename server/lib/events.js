// Server-sent events: each signed-in tab keeps one stream; the server pushes small "something changed"
// signals and the client refetches over the normal authorised API (no private content in the stream).
// ponytail: in-process fan-out; use Postgres LISTEN/NOTIFY when running more than one instance.
export function createEventHub(log) {
  const clients = new Map(); // userId -> Set<res>

  function subscribe(req, res) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 5000\n\n');
    const set = clients.get(req.user.id) || new Set();
    set.add(res);
    clients.set(req.user.id, set);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      set.delete(res);
      if (!set.size) clients.delete(req.user.id);
    });
  }

  function publish(userId, type, data = {}) {
    const set = clients.get(userId);
    if (!set) return;
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try { res.write(payload); } catch (err) { log.warn('sse.write_failed', { err }); }
    }
  }

  return { subscribe, publish, count: () => clients.size };
}
