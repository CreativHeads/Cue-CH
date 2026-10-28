import { fail, json } from '@/lib/api';
import { JOBS, runJob, type JobName } from '@/lib/jobs';
import { secretMatches } from '@/lib/secret';

// Scheduled jobs. Called by the scheduler with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  if (!secretMatches(req.headers.get('authorization')?.replace(/^Bearer /, ''), process.env.CRON_SECRET)) return fail('Unauthorized', 401);
  if (!(JOBS as readonly string[]).includes(job)) return fail('Unknown job', 404);
  const result = await runJob(job as JobName);
  return json(result ?? { status: 'skipped', reason: 'already running' });
}
