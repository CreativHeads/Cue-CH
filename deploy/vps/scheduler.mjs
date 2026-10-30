// Runs the app's scheduled jobs at the brief's IST times (§12) by calling /api/cron/<job>.
// One scheduler for the whole app (no Vercel cron, no pg_cron). Jobs are idempotent and locked,
// so a duplicate or missed call is harmless.
const APP = process.env.APP_INTERNAL_URL || 'http://app:3000';
const SECRET = process.env.CRON_SECRET;
if (!SECRET) { console.error('CRON_SECRET is not set'); process.exit(1); }

/** IST clock parts for a Date. */
function ist(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: +p.day, hour: +p.hour, minute: +p.minute, weekday: p.weekday, key: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` };
}

const RULES = [
  ['sync-posts',   (t) => t.minute === 30 && (t.hour + 1) % 3 === 0],                 // 02:30, 05:30, 08:30 … every 3 hours
  ['sync-stories', (t) => t.minute === 45 && t.hour % 2 === 1],                       // every 2 hours at :45
  ['reminders',    (t) => t.minute % 15 === 0],                                       // every 15 minutes
  ['digest',       (t) => t.hour === 7 && t.minute === 0],                            // 07:00 daily
  ['inactivity',   (t) => t.hour === 10 && t.minute === 0],                           // 10:00 daily
  ['carry-over',   (t) => t.weekday === 'Mon' && t.hour === 0 && t.minute === 15],    // Monday 00:15
  ['month-close',  (t) => (t.day === 1 || t.day === 8) && t.hour === 5 && t.minute === 30],
  ['next-month',   (t) => t.day === 25 && t.hour === 10 && t.minute === 0],
];

async function call(job) {
  const started = Date.now();
  try {
    const res = await fetch(`${APP}/api/cron/${job}`, { headers: { authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(10 * 60e3) });
    const body = await res.text();
    console.log(`${new Date().toISOString()} ${job} ${res.status} ${Date.now() - started}ms ${body.slice(0, 300)}`);
  } catch (e) {
    console.error(`${new Date().toISOString()} ${job} failed: ${e.message}`);
  }
}

let lastKey = '';
async function tick() {
  const t = ist(new Date());
  if (t.key === lastKey) return;
  lastKey = t.key;
  for (const [job, due] of RULES) if (due(t)) call(job);
}

console.log(`scheduler started; calling ${APP}`);
// first Instagram check soon after start so a fresh deploy shows data
setTimeout(() => { call('sync-posts'); call('sync-stories'); }, 60e3);
setInterval(tick, 20e3);
tick();
