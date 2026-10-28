// Fill an EMPTY local database with a realistic sample month so every screen has something to show.
// Usage: DEMO_DATA=yes npm run db:demo
// It refuses to run without DEMO_DATA=yes and skips any client that already has a plan for the month.
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* optional */ }
}

async function main() {
  if (process.env.DEMO_DATA !== 'yes') throw new Error('Refusing to add sample data. Run with DEMO_DATA=yes on a local/test database only.');
  const { db, rows, row } = await import('../src/lib/db');
  const { runGeneration } = await import('../src/lib/plans');
  const { todayIST, ymOf, ymAdd, istDate, diffDays } = await import('../src/lib/dates');

  const today = todayIST();
  const staff = await rows<{ id: string; name: string; role: string }>(`select id, name, role from staff where is_active`);
  const clients = await rows<{ id: string; name: string }>(`select id, name from clients where status = 'active' order by name`);
  const by = (name: string) => staff.find((s) => s.name === name)?.id ?? staff[0].id;
  const designers = staff.filter((s) => s.role === 'designer').map((s) => s.id);
  const editors = staff.filter((s) => s.role === 'editor').map((s) => s.id);
  const lead = by('Thanseeh');
  const titles: Record<string, string[]> = {
    reel: ['Made for your everyday', 'A reason to smile', 'Behind the chair', 'The transformation edit', 'Meet the team', '60 seconds of calm'],
    poster: ['New season. New essentials.', 'Festive offer is here', 'Your smile, our craft', 'Weekend specials', 'Book your visit', 'Open this Sunday'],
    carousel: ['5 tips for healthy gums', 'The menu, explained', 'Before & after', 'Myths vs facts'],
    story: ['Poll: pick a favourite', 'Behind the scenes', 'Quick tip', 'Client love', 'Countdown'],
  };
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (const month of [ymOf(today), ymAdd(ymOf(today), 1)]) {
    for (const [ci, c] of clients.entries()) {
      if (await row(`select 1 from plans where client_id = $1 and month = $2`, [c.id, `${month}-01`])) continue;
      const designer = designers[ci % designers.length] ?? lead, editor = editors[ci % editors.length] ?? lead;
      const plan = (await row<{ id: string }>(`insert into plans (client_id, month, status) values ($1, $2, 'active') returning id`, [c.id, `${month}-01`]))!;
      const items = [
        ['reel', 4 + (ci % 2), { mode: 'weekdays', days: [['TUE', 'FRI'], ['WED', 'SAT'], ['MON', 'THU']][ci % 3] }, editor, '19:00'],
        ['poster', 5, { mode: 'spread' }, designer, '18:00'],
        ['carousel', 3, { mode: 'spread' }, designers[(ci + 1) % designers.length] ?? designer, '17:00'],
        ['story', 0, { mode: 'per_week', count: 2, days: ['MON', 'WED', 'SAT'] }, designer, '12:00'],
      ] as const;
      for (const [i, [type, count, freq, owner, time]] of items.entries()) {
        await db().query(`insert into plan_items (plan_id, content_type, monthly_count, frequency, owner_id, posting_time, sort) values ($1, $2, $3, $4, $5, $6, $7)`,
          [plan.id, type, count, JSON.stringify(freq), owner, time, i]);
      }
      await db().transaction(lead, (tx) => runGeneration(tx, plan.id, false, '0000-00-00'));
    }
  }

  // give tasks titles and a realistic state: most past work posted, some late, a few missed; upcoming work in progress
  const tasks = await rows<{ id: string; content_type: string; due_at: string; owner_id: string; title: string }>(
    `select id, content_type, due_at, owner_id, title from tasks where stage = 'to_brief' and title ~ ' [0-9]+$'`);
  for (const t of tasks) {
    const list = titles[t.content_type] ?? titles.poster;
    const title = list[Math.floor(rand() * list.length)];
    const d = diffDays(istDate(t.due_at), today);
    const r = rand();
    let stage = 'to_brief', delivery: string | null = null, postedAt: string | null = null;
    if (d < 0 || (d === 0 && new Date(t.due_at) < new Date())) {
      if (r < 0.78) { stage = 'posted'; delivery = 'on_time'; postedAt = t.due_at; }
      else if (r < 0.88) { stage = 'posted'; delivery = 'late'; postedAt = new Date(new Date(t.due_at).getTime() + 864e5).toISOString(); }
      else stage = ['designing', 'client_review', 'approved'][Math.floor(rand() * 3)];
    } else if (d <= 2) stage = ['designing', 'client_review', 'approved', 'scheduled'][Math.floor(rand() * 4)];
    else if (d <= 7) stage = ['to_brief', 'designing', 'client_review'][Math.floor(rand() * 3)];
    await db().transaction(t.owner_id, (tx) => tx.query(
      `update tasks set title = $2, stage = $3, delivery = $4, posted_at = $5, priority = case when $6 then 'high' else priority end where id = $1`,
      [t.id, title, stage, delivery, postedAt, rand() < 0.08]));
  }
  console.log(`Sample data ready: ${tasks.length} tasks across ${clients.length} clients.`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
