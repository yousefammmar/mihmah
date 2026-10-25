// Creates (or promotes) an administrator. Admins can never self-register through the API.
// Usage: ADMIN_EMAIL=you@example.com npm run admin:create   (prompts for the password)
import readline from 'node:readline/promises';
import { createContext } from '../server/context.js';
import { hashPassword } from '../server/lib/security.js';

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Set ADMIN_EMAIL to a valid address.');
  process.exit(1);
}
let password = process.env.ADMIN_PASSWORD;
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Password (12+ characters): ');
  rl.close();
}
if (!password || password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}

const ctx = createContext();
try {
  const hash = await hashPassword(password);
  const row = await ctx.db.one(
    `insert into users (email, password_hash, role, email_verified_at) values ($1, $2, 'admin', now())
     on conflict (lower(email)) do nothing returning id`, [email, hash]);
  if (row) console.log(`Admin created: ${email}`);
  else console.error('A user with this email already exists; refusing to change its role or password.');
  if (row) await ctx.db.query("insert into audit_events (actor_id, action, entity_type, entity_id) values ($1, 'admin.created_via_cli', 'user', $1)", [row.id]);
} finally {
  await ctx.db.end();
}
