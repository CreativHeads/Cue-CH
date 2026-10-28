'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useWorkspace } from '@/components/AppShell';
import { ClientModal } from '@/components/ClientModal';
import { Icon } from '@/components/Icon';
import { ClientLogo, ErrorBox, Loading, PageHead, StageBadge, TypeIcon, useData } from '@/components/ui';
import { fmtD, fmtT, fmtYM, istDate, todayIST, ymAdd, ymOf } from '@/lib/dates';
import { monthCount } from '@/lib/generation';
import { band, bandLabel } from '@/lib/score';
import { TYPE_LABEL, typeCount, type Client, type ContentType, type Plan, type PlanItem, type Stage } from '@/lib/types';

type Dot = 'posted' | 'due' | 'missed' | 'extra';
interface Row { client: Client; score: number | null; parts: { planned: number; onTime: number; late: number; extra: number }; inactive: { days: number | null; missed: number } | null;
  cells: Record<string, { dots: Dot[]; tasks: { id: string; title: string; type: ContentType; stage: Stage; dot: Dot }[] }> }

export default function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ws = useWorkspace();
  const today = todayIST();
  const [month, setMonth] = useState(ymOf(today));
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const dash = useData<{ rows: Row[]; days: string[] }>(`/api/dashboard?month=${month}`, [ws.version]);
  const plans = useData<(Plan & { plan_items: PlanItem[] })[]>(`/api/clients/${id}/plans`, [ws.version]);
  const posts = useData<{ id: string; content_type: ContentType; posted_at: string; permalink: string | null; caption: string | null; reach: number | null; likes: number | null; status: string }[]>(`/api/posts?status=all&client=${id}`, [ws.version]);
  const client = ws.clientById(id);
  if (!client) return <ErrorBox error="Client not found." />;
  const row = dash.data?.rows.find((r) => r.client.id === id);
  const plan = plans.data?.find((p) => p.month.slice(0, 7) === month);
  const days = dash.data?.days ?? [];
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;

  return <>
    <PageHead eyebrow={<><Link href="/clients">Clients</Link> › @{client.ig_username}</>} title={<span className="row"><ClientLogo client={client} />{client.name}</span>}
      sub={`${client.is_connected ? 'Instagram connected' : 'Instagram not connected'} · Score ${row?.score == null ? '—' : Math.round(row.score) + '%'} (${bandLabel(row?.score ?? null)}) · ${client.status === 'paused' ? 'Paused' : 'Active'}`}
      actions={<>
        {ws.isAdmin && <button className="btn" onClick={() => setEditing(true)}>Edit client</button>}
        <Link className="btn" href={`/board?client=${id}`}>Open board</Link>
        <Link className="btn primary" href={`/plans?client=${id}&month=${month}`}><Icon name="calendar" />Monthly plan</Link>
      </>} />
    {row?.inactive && <div className="alert red"><Icon name="flag" />No posts for {row.inactive.days ?? 'several'} days while the plan expected content. {row.inactive.missed} planned item{row.inactive.missed === 1 ? '' : 's'} missed.</div>}
    {dash.error && <ErrorBox error={dash.error} />}
    {!row ? <Loading /> : <div className="grid2">
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="month-nav" style={{ marginLeft: 0 }}><button onClick={() => setMonth(ymAdd(month, -1))}>‹</button><h3>{fmtYM(month)}</h3><button onClick={() => setMonth(ymAdd(month, 1))}>›</button></div>
          <div className="legend"><span><i style={{ background: '#7aa954' }} />Posted</span><span><i style={{ background: '#d9a249' }} />Due</span><span><i style={{ background: 'var(--red)' }} />Missed</span></div>
        </div>
        <div className="cal">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <div key={i} className="h">{x}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
          {days.map((x) => <div key={x} className={`d ${x === today ? 'today' : ''}`} style={{ cursor: 'pointer', background: day === x ? 'var(--brand-soft2)' : undefined }} onClick={() => setDay(day === x ? null : x)}>
            {+x.slice(8)}<div className="row" style={{ gap: 2 }}>{row.cells[x]?.dots.slice(0, 4).map((s, i) => <i key={i} className={`dot ${s}`} />)}</div></div>)}
        </div>
        {day && <div style={{ marginTop: 12 }}><b style={{ fontSize: 13 }}>{fmtD(day)}</b>
          {(row.cells[day]?.tasks ?? []).map((t) => <div key={t.id} className="list-item" style={{ padding: '8px 0', border: 0 }} onClick={() => ws.openTask(t.id)}><TypeIcon type={t.type} /><div className="t"><b>{t.title}</b><small>{TYPE_LABEL[t.type]}</small></div>{t.dot === 'missed' ? <span className="badge red">Missed</span> : <StageBadge stage={t.stage} />}</div>)}
          {!row.cells[day]?.tasks.length && <p className="muted" style={{ margin: '6px 0 0' }}>Nothing planned.</p>}</div>}
        <div className="metrics" style={{ marginTop: 16 }}>
          <div><b>{row.parts.planned}</b><small>Due so far</small></div><div><b>{row.parts.onTime}</b><small>On time</small></div>
          <div><b>{row.parts.late}</b><small>Late</small></div><div><b className={{ green: 'band-g', amber: 'band-a', red: 'band-r', none: '' }[band(row.score)]}>{row.score == null ? '—' : Math.round(row.score) + '%'}</b><small>Score</small></div>
        </div>
      </div>
      <div className="card card-pad">
        <h3>Plan summary</h3>
        <div className="sub">{plan ? `${plan.status === 'active' ? 'Active' : plan.status === 'draft' ? 'Draft' : 'Closed'} plan · ${plan.plan_items.reduce((a, i) => a + monthCount(i, month), 0)} deliverables` : 'No plan for this month yet.'}</div>
        {plan?.plan_items.map((i) => <div key={i.id} className="list-item" style={{ padding: '10px 0' }}><TypeIcon type={i.content_type} /><div className="t">
          <b>{typeCount(monthCount(i, month), i.content_type)}</b><small>{freqText(i)} · {fmtT(i.posting_time)} · {ws.staffById(i.owner_id)?.name ?? 'Unassigned'}</small></div></div>)}
        {!plan && <Link className="btn" style={{ marginTop: 12 }} href={`/plans?client=${id}&month=${month}`}>Create plan</Link>}
        <div className="dsec"><h4>Weekly reports</h4><p className="muted" style={{ fontSize: 12, margin: 0 }}>Client-ready weekly PDFs arrive in Phase 4.</p></div>
        <div className="dsec"><h4>Recent posts</h4>
          {(posts.data ?? []).slice(0, 8).map((p) => <a key={p.id} className="list-item" style={{ padding: '8px 0', border: 0 }} href={p.permalink ?? '#'} target="_blank" rel="noopener noreferrer">
            <TypeIcon type={p.content_type} /><div className="t"><b>{(p.caption ?? TYPE_LABEL[p.content_type]).split('\n')[0].slice(0, 60)}</b>
            <small>{fmtD(istDate(p.posted_at))} · {p.reach != null ? `${p.reach.toLocaleString('en-IN')} reached` : 'reach pending'}{p.likes != null ? ` · ${p.likes} likes` : ''}</small></div>
            <span className={`badge ${p.status === 'matched' ? 'green' : p.status === 'extra' ? 'grey' : 'amber'}`}>{p.status === 'matched' ? 'Matched' : p.status === 'extra' ? 'Extra' : p.status === 'ignored' ? 'Ignored' : 'Review'}</span></a>)}
          {posts.data && !posts.data.length && <p className="muted" style={{ fontSize: 12, margin: 0 }}>No Instagram posts seen yet{client.is_connected ? '.' : ': this account isn’t connected.'}</p>}</div>
      </div>
    </div>}
    {editing && <ClientModal client={client} onClose={() => setEditing(false)} />}
  </>;
}

function freqText(i: PlanItem) {
  const f = i.frequency;
  const cap = (d: string) => d[0] + d.slice(1, 3).toLowerCase();
  if (f.mode === 'weekdays') return `Every ${f.days.map(cap).join('/')}`;
  if (f.mode === 'per_week') return `${f.count} per week (${f.days.map(cap).join(', ')})`;
  if (f.mode === 'dates') return `${f.dates.length} fixed dates`;
  return 'Spread evenly';
}
