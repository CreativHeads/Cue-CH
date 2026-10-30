'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { ClientLogo, ErrorBox, Loading, PageHead, Select, StageBadge, TypeIcon, useData } from '@/components/ui';
import { addDays, daysInMonth, DOWS, fmtD, fmtT, fmtYM, istTime, MONTHS, mondayOf, relDay, todayIST, ymAdd, ymOf } from '@/lib/dates';
import { band } from '@/lib/score';
import { FILTER_CONTENT_TYPES, TYPE_LABEL, type Client, type ContentType, type Stage, type Task } from '@/lib/types';

type Dot = 'posted' | 'due' | 'missed' | 'extra';
interface CellTask { id: string; title: string; type: ContentType; stage: Stage; owner: string | null; dot: Dot }
interface Row { client: Client; cells: Record<string, { dots: Dot[]; tasks: CellTask[]; extras: number }>; score: number | null; inactive: { days: number | null; missed: number } | null }
interface Dash { month: string; today: string; days: string[]; rows: Row[]; totals: { planned: number; posted: number; overdue: number; inProgress: number } }

const BAND_CLASS: Record<string, string> = { green: 'band-g', amber: 'band-a', red: 'band-r', none: '' };

export default function Overview() {
  const ws = useWorkspace();
  const today = todayIST();
  const [month, setMonth] = useState(ymOf(today));
  const [mode, setMode] = useState<'month' | '15days' | 'week'>('week');
  const [half, setHalf] = useState<1 | 2>(+today.slice(8) > 15 ? 2 : 1);
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [owner, setOwner] = useState('');
  const [type, setType] = useState('');
  const [problems, setProblems] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const viewMonth = mode === 'week' ? ymOf(weekStart) : month;
  const dash = useData<Dash>(`/api/dashboard?month=${viewMonth}`, [ws.version]);
  const focus = useData<Task[]>(`/api/tasks?from=${today}&to=${today}&open=true${ws.isLead ? '' : `&owner=${ws.me.id}`}`, [ws.version]);

  const h = +istTime(new Date()).slice(0, 2);
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const dt = new Date(today + 'T00:00:00Z');
  const dateStr = `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getUTCDay()]}, ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;

  const d = dash.data;
  const days = !d ? [] : mode === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : mode === '15days'
    ? (half === 1 ? d.days.slice(0, 15) : d.days.slice(15))
    : d.days;
  const visible = (t: CellTask) => (!owner || t.owner === owner) && (!type || t.type === type);
  const dotsFor = (r: Row, day: string) => {
    const c = r.cells[day];
    if (!c) return [];
    return [...c.tasks.filter(visible).map((t) => t.dot), ...(type ? [] : Array<Dot>(c.extras).fill('extra'))];
  };
  const rows = d?.rows.filter((r) => !problems || r.inactive || days.some((x) => dotsFor(r, x).includes('missed'))) ?? [];
  const pct = d && d.totals.planned ? Math.round((d.totals.posted / d.totals.planned) * 100) : 0;
  const dayTasks = day && d ? d.rows.flatMap((r) => (r.cells[day]?.tasks ?? []).filter(visible).map((t) => ({ ...t, client: r.client }))) : [];

  const nav = (n: number) => {
    if (mode === 'week') {
      setWeekStart(addDays(weekStart, 7 * n));
    } else if (mode === '15days') {
      if (n > 0) {
        if (half === 1) setHalf(2);
        else { setMonth(ymAdd(month, 1)); setHalf(1); }
      } else {
        if (half === 2) setHalf(1);
        else { setMonth(ymAdd(month, -1)); setHalf(2); }
      }
    } else {
      setMonth(ymAdd(month, n));
    }
    setDay(null);
  };

  return <>
    <PageHead eyebrow={dateStr} title={<>{greet}, {ws.me.name} <span style={{ color: '#7b9bff' }}>✳</span></>} sub="A little clarity for your creative day."
      actions={<button className="btn primary" onClick={() => ws.newTask()}><Icon name="plus" />New task</button>} />
    {dash.error && <ErrorBox error={dash.error} />}
    {!d ? <Loading /> : <>
      <div className="stats">
        <Link href="/board" className="card stat plan"><div className="top">Planned content<span className="ic"><Icon name="calendar" /></span></div><div className="num">{d.totals.planned}</div><p>{d.totals.planned} deliverables across {ws.clients.filter((c) => c.status === 'active').length} clients</p></Link>
        <div className="card stat good"><div className="top">Successfully posted<span className="ic"><Icon name="checkc" /></span></div><div className="num">{d.totals.posted}</div><p>↗ {pct}% of {fmtYM(viewMonth).split(' ')[0]}’s plan delivered</p><span className="bar" style={{ width: `${pct}%` }} /></div>
        <Link href="/board" className="card stat prog"><div className="top">In progress<span className="ic"><Icon name="clock" /></span></div><div className="num">{d.totals.inProgress}</div><p>Moving from ideas to great content</p></Link>
        <Link href="/tasks" className="card stat att"><div className="top">Needs attention<span className="ic"><Icon name="flag" /></span></div><div className="num">{d.totals.overdue}</div><p>△ {d.totals.overdue} past the posting deadline</p></Link>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="glance-head">
          <div><h3>Delivery at a glance</h3><div className="sub">Every client. Every day. Nothing slipping through.</div></div>
          <div className="row wrap">
            <div className="legend"><span><i style={{ background: '#7aa954' }} />Posted</span><span><i style={{ background: '#d9a249' }} />Due</span><span><i style={{ background: 'var(--red)' }} />Missed</span><span><i style={{ background: 'var(--grey)' }} />Extra</span></div>
            <div className="seg">
              <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Week</button>
              <button className={mode === '15days' ? 'on' : ''} onClick={() => setMode('15days')}>15 Days</button>
              <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Month</button>
            </div>
          </div>
        </div>
        <div className="filters">
          <Select icon="user" value={owner} onChange={setOwner} options={[['', 'All owners'], ...ws.staff.filter((s) => s.is_active).map((s) => [s.id, s.name] as [string, string])]} />
          <Select icon="overview" value={type} onChange={setType} options={[['', 'All content types'], ...FILTER_CONTENT_TYPES.map((t) => [t, TYPE_LABEL[t]] as [string, string])]} />
          <button className={`chip-btn ${problems ? 'on' : ''}`} onClick={() => setProblems(!problems)}><Icon name="flag" size={14} />Only problems</button>
          <div className="month-nav">
            <button onClick={() => nav(-1)}>‹</button>
            <span>
              {mode === 'week'
                ? `${fmtD(days[0])} – ${fmtD(days[6])}`
                : mode === '15days'
                ? `${fmtYM(month)} (${half === 1 ? '1–15' : `16–${daysInMonth(month)}`})`
                : fmtYM(month)}
            </span>
            <button onClick={() => nav(1)}>›</button>
          </div>
        </div>
        <div className="gtable-wrap"><table className={`gtable mode-${mode}`}>
          <thead><tr><th className="cl">CLIENT</th>{days.map((x) => <th key={x} className={x === today ? 'today' : ''}><span>{+x.slice(8)}</span><small>{DOWS[new Date(x + 'T00:00:00Z').getUTCDay()][0]}</small></th>)}<th>SCORE</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.client.id}>
              <td className="cl"><Link className="client-cell" href={`/clients/${r.client.id}`}><ClientLogo client={r.client} /><div><b>{r.client.name.replace(' Studio', '')}{r.inactive && <span className="flag" title={`No posts for ${r.inactive.days ?? 'many'} days`}><Icon name="flag" size={12} /></span>}</b><small>@{r.client.ig_username}</small></div></Link></td>
              {days.map((x) => {
                const dots = dotsFor(r, x);
                const tip = (r.cells[x]?.tasks ?? []).filter(visible).map((t) => `${TYPE_LABEL[t.type]}: ${t.title}`).join('\n');
                return <td key={x} title={tip} className={`day ${x === today ? 'today' : ''} ${day === x ? 'picked' : ''}`} onClick={() => setDay(day === x ? null : x)}>
                  {dots.length ? <div className="dots">{dots.slice(0, 3).map((s, i) => <i key={i} className={`dot ${s}`} />)}</div> : <span className="empty-dot">·</span>}</td>;
              })}
              <td className={`score ${BAND_CLASS[band(r.score)]}`}>{r.score == null ? '—' : `${Math.round(r.score)}%`}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={days.length + 2} className="empty">{d.rows.length ? 'No problems in this view. 🎉' : 'Add clients to see them here.'}</td></tr>}
          </tbody>
        </table></div>
        {day && <div className="day-detail"><h4>{relDay(day) === fmtD(day) ? fmtD(day) : `${relDay(day)} · ${fmtD(day)}`} — {dayTasks.length} planned</h4>
          {dayTasks.map((t) => <div key={t.id} className="list-item" style={{ border: 0, padding: '8px 0' }} onClick={() => ws.openTask(t.id)}><TypeIcon type={t.type} /><div className="t"><b>{t.title}</b><small>{t.client.name} · {TYPE_LABEL[t.type]} · {ws.staffById(t.owner)?.name ?? 'Unassigned'}</small></div>{t.dot === 'missed' ? <span className="badge red">Missed</span> : <StageBadge stage={t.stage} />}</div>)}
          {!dayTasks.length && <p className="muted" style={{ margin: 0 }}>Nothing planned for this day.</p>}</div>}
        <div className="glance-foot"><span>Select a day to see its content. Scores include tasks due so far.</span><span>All times in IST</span></div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-pad row" style={{ justifyContent: 'space-between' }}><div><h3>Today’s focus <span className="badge nodot grey">{focus.data?.length ?? 0}</span></h3><div className="sub">A few next steps to keep things moving.</div></div><Link className="btn sm" href="/tasks">View all tasks</Link></div>
          {focus.data?.length ? focus.data.map((t) => <div key={t.id} className="list-item" onClick={() => ws.openTask(t.id)}><TypeIcon type={t.content_type} /><div className="t"><b>{t.title}</b><small>{ws.clientById(t.client_id)?.name} · {TYPE_LABEL[t.content_type]} · {fmtT(istTime(t.due_at))}</small></div><StageBadge stage={t.stage} /></div>)
            : <div className="empty">Nothing due today. Enjoy the calm.</div>}
        </div>
        <div className="card"><div className="card-pad"><h3>A little attention needed</h3><div className="sub">Let’s give these a nudge.</div></div>
          {d.rows.filter((r) => r.inactive).map((r) => <div className="attn" key={r.client.id}><span className="ic" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}><Icon name="flag" /></span><div><b>{r.client.name} has been quiet{r.inactive!.days != null ? ` for ${r.inactive!.days} days` : ''}</b><p>{r.inactive!.missed} planned item{r.inactive!.missed === 1 ? '' : 's'} missed. A good time to check in.</p><Link className="link-btn" href={`/clients/${r.client.id}`}>Open client →</Link></div></div>)}
          {d.totals.overdue > 0 && <div className="attn"><span className="ic" style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}><Icon name="clock" /></span><div><b>{d.totals.overdue} task{d.totals.overdue === 1 ? ' is' : 's are'} past the posting deadline</b><p>Mark them posted or move them along.</p><Link className="link-btn" href="/tasks">Open my tasks →</Link></div></div>}
          <div className="attn"><span className="ic" style={{ background: '#f3f8ea', color: '#4d8a35' }}><Icon name="calendar" /></span><div><b>{MONTHS[+ymAdd(ymOf(today), 1).slice(5) - 1]} is around the corner</b><p>Review next month’s plans before they go live.</p><Link className="link-btn" href="/plans">Review monthly plans →</Link></div></div>
        </div>
      </div>
      <div className="footer-note">Made for the people behind the posts.<br />All times in IST · CreativHeads®</div>
    </>}
  </>;
}
