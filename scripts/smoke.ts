// End-to-end smoke test over HTTP against a running app + real database.
// Usage: BASE_URL=http://localhost:3000 ADMIN_EMAIL=.. ADMIN_PASSWORD=.. DESIGNER_EMAIL=.. DESIGNER_PASSWORD=.. npm run smoke
// It works in a month two years ahead so real data is left alone. If DATABASE_URL is available
// (.env.local or env), everything it created is deleted at the end.
import { Client } from 'pg';

for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* optional */ }
}
const created = { plans: [] as string[], staff: [] as string[], tasks: [] as string[] };
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let failures = 0;

function check(ok: unknown, label: string, detail?: unknown) {
  if (ok) console.log(`  ✓ ${label}`);
  else { failures++; console.log(`  ✗ ${label}`, detail ?? ''); }
}

async function session(email?: string, password?: string) {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(BASE + path, {
      method, redirect: 'manual',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, data, location: res.headers.get('location') };
  };
  if (email) {
    const r = await call('POST', '/api/auth/login', { email, password });
    check(r.status === 200 && cookie.startsWith('ch_session='), `sign in as ${email}`, r.data);
  }
  return call;
}

async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, DESIGNER_EMAIL, DESIGNER_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');

  console.log('\nSign-in and access');
  const anon = await session();
  check((await anon('GET', '/api/me')).status === 401, 'API refuses anonymous requests');
  const page = await anon('GET', '/');
  check(page.status === 307 && page.location?.includes('/signin'), 'pages redirect to sign-in');
  check((await anon('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: 'definitely-wrong' })).status === 401, 'wrong password is rejected');

  const admin = await session(ADMIN_EMAIL, ADMIN_PASSWORD);
  const me = await admin('GET', '/api/me');
  check(me.status === 200 && me.data.me.role === 'admin', '/api/me returns the admin', me.data);
  check(!JSON.stringify(me.data).includes('password_hash') && !JSON.stringify(me.data).includes('scrypt$'), 'no password hashes leave the server');
  const staff: any[] = me.data.staff, clients: any[] = me.data.clients;
  check(staff.length >= 6 && clients.length >= 6, `${staff.length} staff and ${clients.length} clients loaded`);
  const client = clients[0];
  const editor = staff.find((s) => s.role === 'editor');
  const designer = staff.find((s) => s.email.toLowerCase() === DESIGNER_EMAIL?.toLowerCase());

  console.log('\nClients');
  const c1 = await admin('GET', `/api/clients/${client.id}`);
  check(c1.status === 200 && c1.data.name === client.name, 'read a client');
  const c2 = await admin('PATCH', `/api/clients/${client.id}`, { inactivity_days: client.inactivity_days });
  check(c2.status === 200, 'update a client', c2.data);
  check((await admin('GET', '/api/clients/not-a-uuid')).status === 400, 'bad ids give 400, not 500');

  console.log('\nMonthly plan → tasks');
  const y = new Date().getUTCFullYear() + 2;
  const month = `${y}-11`;
  const plan = await admin('POST', `/api/clients/${client.id}/plans`, { month });
  check(plan.status === 201, `create draft plan for ${month}`, plan.data);
  const planId = plan.data.id;
  created.plans.push(planId);
  check((await admin('POST', `/api/clients/${client.id}/plans`, { month })).status === 409, 'second plan for the same month is refused');
  const i1 = await admin('POST', `/api/plans/${planId}/items`, { content_type: 'reel', monthly_count: 8, frequency: { mode: 'weekdays', days: ['TUE', 'FRI'] }, owner_id: editor.id, posting_time: '19:00' });
  check(i1.status === 201, 'add reel line (8, Tue/Fri, 7 PM)', i1.data);
  const i2 = await admin('POST', `/api/plans/${planId}/items`, { content_type: 'poster', monthly_count: 4, frequency: { mode: 'spread' }, owner_id: designer?.id ?? null, posting_time: '18:00', sort: 1 });
  check(i2.status === 201, 'add poster line (4, spread)', i2.data);
  const i3 = await admin('PATCH', `/api/plan-items/${i2.data.id}`, { monthly_count: 5 });
  check(i3.status === 200 && i3.data.monthly_count === 5, 'edit a plan line');
  const list = await admin('GET', `/api/clients/${client.id}/plans`);
  const listed = list.data.find?.((p: any) => p.id === planId);
  check(list.status === 200 && listed?.plan_items?.length === 2 && listed.month.startsWith(month), 'plans list includes items', list.data);
  const preview = await admin('POST', `/api/plans/${planId}/generate?dry_run=true`);
  check(preview.status === 200 && preview.data.created === 13, 'preview: 13 tasks (8 reels + 5 posters)', preview.data);
  const getPlan = await admin('GET', `/api/plans/${planId}`);
  check(getPlan.status === 200 && getPlan.data.items.length === 2, 'read plan with preview');
  const act = await admin('PATCH', `/api/plans/${planId}`, { status: 'active' });
  check(act.status === 200 && act.data.generation?.created === 13, 'activate → 13 tasks created', act.data);
  const regen = await admin('POST', `/api/plans/${planId}/generate`);
  check(regen.status === 200 && regen.data.created === 0, 're-generate creates no duplicates', regen.data);
  const notes = await admin('PATCH', `/api/plans/${planId}`, { notes: 'Diwali launch' });
  check(notes.status === 200 && notes.data.plan.notes === 'Diwali launch', 'save plan notes');
  const next = await admin('POST', `/api/plans/${planId}/copy-next`);
  check(next.status === 201, 'copy to next month', next.data);
  if (next.data?.id) created.plans.push(next.data.id);

  console.log('\nTasks');
  const tasks = await admin('GET', `/api/tasks?client=${client.id}&from=${month}-01&to=${month}-30`);
  check(tasks.status === 200 && tasks.data.length === 13, 'list tasks by client and dates', tasks.data.length ?? tasks.data);
  const reels = tasks.data.filter((t: any) => t.content_type === 'reel');
  check(reels.length === 8, '8 reel tasks');
  const reel = reels[0];
  const t1 = await admin('GET', `/api/tasks/${reel.id}`);
  check(t1.status === 200 && t1.data.events.length >= 1, 'task detail with history');
  const t2 = await admin('PATCH', `/api/tasks/${reel.id}`, { stage: 'designing', brief: 'Behind the scenes' });
  check(t2.status === 200 && t2.data.stage === 'designing', 'move stage + edit brief');
  const t3 = await admin('POST', `/api/tasks/${reel.id}/notes`, { text: 'First draft shared' });
  check(t3.status === 201, 'add note');
  const t4 = await admin('POST', `/api/tasks/${reel.id}/mark-posted`, {});
  check(t4.status === 400, 'mark posted without a link is refused for a reel');
  const t5 = await admin('POST', `/api/tasks/${reel.id}/mark-posted`, { permalink: 'https://instagram.com/p/smoke' });
  check(t5.status === 200 && t5.data.delivery === 'manual_unverified', 'mark posted with link');
  const manual = await admin('POST', '/api/tasks', { client_id: client.id, content_type: 'story', owner_id: editor.id, stage: 'to_brief', due_date: `${month}-15`, posting_time: '12:00', title: 'Smoke story', priority: 'high' });
  check(manual.status === 201 && manual.data.priority === 'high', 'create a manual task', manual.data);
  if (manual.data?.id) created.tasks.push(manual.data.id);
  check((await admin('GET', `/api/tasks?stage=nope`)).status === 400, 'invalid filters give 400');

  console.log('\nDashboard');
  const dash = await admin('GET', `/api/dashboard?month=${month}`);
  check(dash.status === 200 && dash.data.rows.length >= 6 && dash.data.days.length === 30, 'grid has every client and 30 days', dash.data.error);
  const row = dash.data.rows?.find((r: any) => r.client.id === client.id);
  const dots = row ? Object.values(row.cells).flatMap((c: any) => c.dots) : [];
  check(dots.length === 14 && dots.filter((d) => d === 'posted').length === 1, 'grid cells: 14 tasks, 1 posted', dots);
  check(dash.data.totals?.planned >= 14, 'totals computed', dash.data.totals);
  check((await admin('GET', '/api/dashboard')).status === 200, 'current month dashboard');

  if (DESIGNER_EMAIL && DESIGNER_PASSWORD) {
    console.log('\nDesigner permissions');
    const des = await session(DESIGNER_EMAIL, DESIGNER_PASSWORD);
    check((await des('PATCH', `/api/tasks/${reels[1].id}`, { stage: 'designing' })).status === 403, 'cannot edit someone else’s task');
    check((await des('PATCH', `/api/plans/${planId}`, { notes: 'x' })).status === 403, 'cannot edit plans');
    check((await des('POST', '/api/clients', { name: 'X', ig_username: 'x' })).status === 403, 'cannot add clients');
    check((await des('POST', '/api/staff', { name: 'X', email: 'x@x.com', role: 'admin', password: '12345678' })).status === 403, 'cannot add staff');
    const poster = tasks.data.find((t: any) => t.content_type === 'poster');
    if (poster && designer && poster.owner_id === designer.id) {
      check((await des('PATCH', `/api/tasks/${poster.id}`, { stage: 'designing' })).status === 200, 'can move own task');
      check((await des('PATCH', `/api/tasks/${poster.id}`, { owner_id: editor.id })).status === 403, 'cannot reassign own task');
    }
    const own = await des('POST', '/api/tasks', { client_id: client.id, content_type: 'poster', owner_id: editor.id, stage: 'to_brief', due_date: `${month}-20`, posting_time: '18:00', title: 'Designer task', priority: 'normal' });
    check(own.status === 201 && own.data.owner_id === designer?.id, 'own new tasks are always theirs');
    if (own.data?.id) created.tasks.push(own.data.id);
    check((await des('POST', '/api/auth/password', { current: 'wrong-password', next: 'whatever123' })).status === 400, 'password change needs the current password');
  }

  console.log('\nTeam');
  const tmpEmail = `smoke-${Date.now()}@example.com`;
  const s1 = await admin('POST', '/api/staff', { name: 'Smoke Tester', email: tmpEmail, role: 'designer', password: 'smoke-pass-123' });
  check(s1.status === 201 && !('password_hash' in s1.data), 'add teammate', s1.data);
  if (s1.data?.id) created.staff.push(s1.data.id);
  const tmp = await session(tmpEmail, 'smoke-pass-123');
  check((await tmp('GET', '/api/me')).status === 200, 'new teammate can sign in');
  const s2 = await admin('PATCH', `/api/staff/${s1.data.id}`, { is_active: false });
  check(s2.status === 200 && s2.data.is_active === false, 'deactivate teammate');
  check((await tmp('GET', '/api/me')).status === 401, 'deactivated teammate is signed out');
  check((await admin('PATCH', `/api/staff/${me.data.me.id}`, { is_active: false })).status === 400, 'admin cannot deactivate themself');

  console.log('\nClean-up');
  const out = await admin('POST', '/api/auth/signout');
  check(out.status === 303, 'sign out');
  check((await admin('GET', '/api/me')).status === 401, 'session is gone after sign-out');

  if (process.env.DATABASE_URL) {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(`delete from tasks where id = any($1::uuid[]) or plan_item_id in (select id from plan_items where plan_id = any($2::uuid[]))`, [created.tasks, created.plans]);
    await db.query(`delete from plans where id = any($1::uuid[])`, [created.plans]);
    await db.query(`delete from staff where id = any($1::uuid[])`, [created.staff]);
    await db.end();
    console.log('  ✓ test data removed');
  } else console.log('  · DATABASE_URL not set: test data left in place');

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
