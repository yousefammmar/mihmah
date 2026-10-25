// Structured JSON logs. Sensitive keys are redacted; request bodies and message content are never logged.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /pass|token|secret|authorization|cookie|csrf|body|content|proposal|note/i;

function redact(value, depth = 0) {
  if (value == null || typeof value !== 'object' || depth > 3) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code };
  const out = Array.isArray(value) ? [] : {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

export function createLogger(level = 'info', stream = process.stdout) {
  const min = LEVELS[level] ?? 20;
  const write = (lvl, msg, fields) => {
    if (LEVELS[lvl] < min) return;
    stream.write(`${JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...redact(fields || {}) })}\n`);
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}
