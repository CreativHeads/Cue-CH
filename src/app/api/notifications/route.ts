import { context, handler, json } from '@/lib/api';
import { rows } from '@/lib/db';

/** Recent outbound messages (the outbox). Leads/admins see all; others see their own. */
export const GET = handler(async () => {
  const c = await context();
  return json(await rows(
    `select n.id, n.kind, n.text, n.sent_at, n.error, n.created_at, s.name as staff_name
       from notifications n left join staff s on s.id = n.staff_id
      ${c.isLead ? '' : 'where n.staff_id = $1'} order by n.created_at desc limit 50`, c.isLead ? [] : [c.me.id]));
});
