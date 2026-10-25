// Audit events, notifications and their post-commit side effects (SSE signal + optional email).
import { templates } from './mailer.js';

// Never put secrets, tokens, passwords or message bodies in metadata.
export function audit(client, { actorId, action, entityType, entityId = null, metadata = {} }) {
  return client.query(
    'insert into audit_events (actor_id, action, entity_type, entity_id, metadata) values ($1, $2, $3, $4, $5)',
    [actorId || null, action, entityType, entityId, metadata],
  );
}

const EMAIL_PREF = { applications: 'email_applications', offers: 'email_offers', projects: 'email_projects', messages: 'email_messages' };

// Inserts the notification inside the caller's transaction; pushes/emails only after commit.
export async function notify(ctx, client, after, { userId, type, title, link, emailGroup }) {
  await client.query('insert into notifications (user_id, type, title, link) values ($1, $2, $3, $4)', [userId, type, title, link || null]);
  after(async () => {
    ctx.events.publish(userId, 'notification', { type });
    if (!emailGroup) return;
    const row = await ctx.db.one(
      `select u.email, u.email_verified_at, coalesce(p.${EMAIL_PREF[emailGroup]}, true) as wants
         from users u left join notification_preferences p on p.user_id = u.id where u.id = $1`,
      [userId],
    );
    if (row?.wants && row.email_verified_at) {
      const url = `${ctx.config.appUrl}/#${link || '/notifications'}`;
      await ctx.mailer.send({ to: row.email, ...templates.notification(title, url) });
    }
  });
}

// Tells both sides of a project to refetch (used for messages and status changes).
export function signal(ctx, after, userIds, type, data) {
  after(() => { for (const id of userIds) ctx.events.publish(id, type, data); });
}
