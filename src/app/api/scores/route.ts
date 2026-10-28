import { context, handler, HttpError, json } from '@/lib/api';
import { rows } from '@/lib/db';
import { month as monthSchema } from '@/lib/schemas';

// GET /api/scores?month=YYYY-MM → month-end delivery scores (provisional on the 1st, final on the 8th)
export const GET = handler(async (req: Request) => {
  await context();
  const month = new URL(req.url).searchParams.get('month');
  if (month && !monthSchema.safeParse(month).success) throw new HttpError(400, 'month: expected YYYY-MM');
  return json(await rows(
    `select s.*, c.name as client_name from monthly_scores s join clients c on c.id = s.client_id
      ${month ? 'where s.month = $1' : ''} order by s.month desc, c.name`, month ? [`${month}-01`] : []));
});
