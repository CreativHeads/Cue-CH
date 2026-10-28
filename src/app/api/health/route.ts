import { context, handler, json } from '@/lib/api';
import { rows } from '@/lib/db';
import { JOB_INTERVAL, JOBS, jobLabel } from '@/lib/jobs';
import { telegramConfigured, webhookEnabled } from '@/lib/telegram';

/** Last run per job, plus a stale flag when a job hasn't succeeded in twice its interval. */
export const GET = handler(async () => {
  await context();
  const last = await rows<{ job: string; started_at: string; finished_at: string | null; status: string | null; stats: unknown; error: string | null }>(
    `select distinct on (job) job, started_at, finished_at, status, stats, error from sync_runs order by job, started_at desc`);
  const ok = await rows<{ job: string; t: string }>(`select job, max(finished_at) t from sync_runs where status in ('ok','partial') group by job`);
  const now = Date.now();
  const jobs = JOBS.map((j) => {
    const l = last.find((x) => x.job === j), good = ok.find((x) => x.job === j)?.t ?? null;
    return { job: j, label: jobLabel(j), last: l ?? null, lastSuccess: good, stale: !good || now - Date.parse(good) > 2 * JOB_INTERVAL[j] * 60e3 };
  });
  const recent = await rows(`select id, job, started_at, finished_at, status, stats, error from sync_runs order by started_at desc limit 20`);
  return json({
    jobs, recent,
    config: { instagram: !!process.env.WINDSOR_API_KEY, telegram: telegramConfigured(), telegramWebhook: webhookEnabled(), scheduler: !!process.env.CRON_SECRET },
  });
});
