import { context, handler, json } from '@/lib/api';
import { rows } from '@/lib/db';
import { STAFF_SELECT } from '@/lib/types';

// Bootstrap payload for the app shell: who am I, the team and the clients.
export const GET = handler(async () => {
  const c = await context();
  const staff = await rows(`select ${STAFF_SELECT} from staff order by case role when 'admin' then 0 when 'lead' then 1 else 2 end, name`);
  const clients = await rows(`select * from clients where status <> 'archived' order by name`);
  return json({ me: c.me, staff, clients });
});
