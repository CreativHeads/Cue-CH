'use client';
import { useState } from 'react';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { ErrorBox, Loading, PageHead, useData } from '@/components/ui';
import { addDays, daysInMonth, dow, fmtD, fmtT, fmtYM, istDate, istTime, mondayOf, todayIST, ymAdd, ymOf } from '@/lib/dates';
import type { Report } from '@/lib/report';
import { band, bandLabel } from '@/lib/score';
import { STAGE_LABEL } from '@/lib/types';

interface Score { client_id: string; client_name: string; month: string; planned: number; on_time: number; late: number; missed: number; extra: number; score: string | null; is_final: boolean }
type Period = 'day' | 'week' | 'month';
const BAND: Record<string, string> = { green: 'band-g', amber: 'band-a', red: 'band-r', none: '' };
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const n = (v: number) => v.toLocaleString('en-IN');
const pct = (s: number | null) => (s == null ? '—' : `${Math.round(s)}%`);

/** The IST date range a period covers, with its label, for the day / week / month containing `anchor`. */
function range(period: Period, anchor: string) {
  if (period === 'day') return { from: anchor, to: anchor, label: `${DAY[dow(anchor)]}, ${fmtD(anchor)}` };
  if (period === 'week') { const from = mondayOf(anchor), to = addDays(from, 6); return { from, to, label: `${fmtD(from)} – ${fmtD(to)}` }; }
  const m = ymOf(anchor);
  return { from: `${m}-01`, to: `${m}-${daysInMonth(m)}`, label: fmtYM(m) };
}
const step = (period: Period, anchor: string, dir: number) =>
  period === 'day' ? addDays(anchor, dir) : period === 'week' ? addDays(anchor, 7 * dir) : `${ymAdd(ymOf(anchor), dir)}-01`;

export default function Reports() {
  const ws = useWorkspace();
  const today = todayIST();
  const [period, setPeriod] = useState<Period>('day');
  const [anchor, setAnchor] = useState(today);
  const r = range(period, anchor);
  const isCurrent = r.from <= today && today <= r.to;
  const { data, error } = useData<Report>(`/api/reports?from=${r.from}&to=${r.to}`, [ws.version]);
  const scores = useData<Score[]>(period === 'month' ? `/api/scores?month=${ymOf(anchor)}` : null, [ws.version]);
  const t = data?.total;

  return <>
    <PageHead eyebrow="Good work deserves a good recap" title="How the work went." sub="Planned against posted, by client and by designer. Live, for any day, week or month." />
    <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="seg">{([['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']] as [Period, string][]).map(([k, l]) =>
          <button key={k} className={period === k ? 'on' : ''} onClick={() => { setPeriod(k); setAnchor(today); }}>{l}</button>)}</div>
        <div className="period-nav">
          <button className="icon-btn" title="Previous" onClick={() => setAnchor(step(period, anchor, -1))}>‹</button>
          <b>{r.label}</b>
          <button className="icon-btn" title="Next" onClick={() => setAnchor(step(period, anchor, 1))}>›</button>
          {!isCurrent && <button className="btn sm" onClick={() => setAnchor(today)}>{period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</button>}
        </div>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>Score = (on time + ½ late + ¾ marked by hand) ÷ due so far</span>
    </div>
    {error && <ErrorBox error={error} />}
    {!data || !t ? <Loading /> : <>
      <div className="stats">
        <div className="card stat"><div className="top">Planned</div><div className="num">{t.planned}</div><p>{t.upcoming ? `${t.upcoming} still to come` : 'All due already'}</p></div>
        <div className="card stat good"><div className="top">Posted</div><div className="num">{t.posted}</div><p>{t.onTime} on time · {t.late} late{t.manual ? ` · ${t.manual} by hand` : ''}</p><i className="bar" style={{ width: t.planned ? `${(t.posted / t.planned) * 100}%` : 0 }} /></div>
        <div className={`card stat ${t.missed ? 'att' : ''}`}><div className="top">Missed</div><div className="num">{t.missed}</div><p>Due and not posted</p></div>
        <div className="card stat"><div className="top">Score</div><div className={`num ${BAND[band(t.score)]}`}>{pct(t.score)}</div><p>{bandLabel(t.score)} · {t.extra} extra post{t.extra === 1 ? '' : 's'} · {n(t.reach)} reach · {n(t.likes)} likes</p></div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad"><h3>By client</h3></div>
        {!data.clients.length ? <div className="empty">Nothing planned or posted in this period.</div> :
          <table className="ttable"><thead><tr><th>Client</th><th>Planned</th><th>Posted</th><th className="hide-m">On time</th><th className="hide-m">Late</th><th>Missed</th><th className="hide-m">To come</th><th className="hide-m">Extra</th><th className="hide-m">Reach</th><th>Score</th></tr></thead>
            <tbody>{data.clients.map((c) => <tr key={c.client_id}><td><b>{c.name}</b></td><td>{c.planned}</td><td>{c.posted}</td><td className="hide-m">{c.onTime}</td><td className="hide-m">{c.late}</td>
              <td className={c.missed ? 'band-r' : ''}>{c.missed}</td><td className="hide-m">{c.upcoming}</td><td className="hide-m">{c.extra}</td><td className="hide-m">{n(c.reach)}</td>
              <td className={BAND[band(c.score)]}><b>{pct(c.score)}</b> <small>{bandLabel(c.score)}</small></td></tr>)}</tbody></table>}
      </div>

      <div className="grid2" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        <div className="card"><div className="card-pad"><h3>By designer</h3></div>
          {!data.designers.length ? <div className="empty">No tasks in this period.</div> :
            <table className="ttable"><thead><tr><th>Person</th><th>Tasks</th><th>Posted</th><th className="hide-m">On time</th><th>Missed</th><th className="hide-m">In progress</th></tr></thead>
              <tbody>{data.designers.map((d) => <tr key={d.owner_id ?? 'none'}><td><b>{d.name}</b></td><td>{d.assigned}</td><td>{d.posted}</td><td className="hide-m">{d.onTime}</td>
                <td className={d.missed ? 'band-r' : ''}>{d.missed}</td><td className="hide-m">{d.inProgress}</td></tr>)}</tbody></table>}
        </div>
        <div className="card"><div className="card-pad"><h3>Missed tasks</h3><div className="sub">Due and not posted yet.</div></div>
          {!data.missedTasks.length ? <div className="empty">Nothing missed. 🎉</div> : data.missedTasks.map((m) => (
            <div key={m.id} className="list-item" onClick={() => ws.openTask(m.id)}>
              <div className="t"><b>{m.title}</b><small className="muted">{m.client} · {m.owner ?? 'Unassigned'} · due {fmtD(istDate(m.due_at))}, {fmtT(istTime(m.due_at))}</small></div>
              <span className={`badge st-${m.stage}`}>{STAGE_LABEL[m.stage]}</span>
            </div>))}
        </div>
      </div>

      {period === 'month' && <div className="card" style={{ marginTop: 18 }}><div className="card-pad"><h3>Official month-end score</h3><div className="sub">Saved on the 1st (provisional) and the 8th (final, once late posts are counted).</div></div>
        {!scores.data ? <Loading /> : !scores.data.length ? <div className="empty">Not worked out for {r.label} yet. It appears on the 1st and the 8th of the following month.</div> :
          <table className="ttable"><thead><tr><th>Client</th><th>Planned</th><th className="hide-m">On time</th><th className="hide-m">Late</th><th>Missed</th><th className="hide-m">Extra</th><th>Score</th></tr></thead>
            <tbody>{scores.data.map((s) => { const sc = s.score == null ? null : Number(s.score); return (
              <tr key={s.client_id}><td><b>{s.client_name}</b><br /><small className="muted">{s.is_final ? 'Final' : 'Provisional'}</small></td>
                <td>{s.planned}</td><td className="hide-m">{s.on_time}</td><td className="hide-m">{s.late}</td><td>{s.missed}</td><td className="hide-m">{s.extra}</td>
                <td className={BAND[band(sc)]}><b>{sc == null ? '—' : sc.toFixed(1)}</b> <small>{bandLabel(sc)}</small></td></tr>); })}</tbody></table>}
      </div>}
    </>}
    <div className="info-bar" style={{ marginTop: 18 }}><Icon name="info" size={15} />Weekly client reports with a PDF arrive in Phase 4.</div>
  </>;
}
