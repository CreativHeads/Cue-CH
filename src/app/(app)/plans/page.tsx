'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { api, ClientLogo, ErrorBox, Loading, PageHead, Select, toast, useData } from '@/components/ui';
import { daysInMonth, fmtD, fmtYM, monthDays, MONTHS, todayIST, ymAdd, ymOf } from '@/lib/dates';
import { itemDates } from '@/lib/generation';
import { CONTENT_TYPES, TYPE_LABEL, typeCount, type ContentType, type Frequency, type Plan, type PlanItem, type Weekday } from '@/lib/types';

const WEEK: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const RHYTHM: [Frequency['mode'], string][] = [['weekdays', 'On weekdays'], ['per_week', 'Per week'], ['spread', 'Spread evenly'], ['dates', 'Fixed dates']];
type PlanWithItems = Plan & { plan_items: PlanItem[] };

function defaultFreq(mode: Frequency['mode']): Frequency {
  if (mode === 'weekdays') return { mode, days: ['TUE', 'FRI'] };
  if (mode === 'per_week') return { mode, count: 3, days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] };
  if (mode === 'dates') return { mode, dates: [] };
  return { mode: 'spread' };
}

function Plans() {
  const ws = useWorkspace();
  const params = useSearchParams();
  const today = todayIST();
  const [clientId, setClientId] = useState(params.get('client') ?? ws.clients[0]?.id ?? '');
  const [month, setMonth] = useState(params.get('month') ?? ymAdd(ymOf(today), 1));
  const { data, error, reload } = useData<PlanWithItems[]>(clientId ? `/api/clients/${clientId}/plans` : null, [ws.version]);
  const plan = data?.find((p) => p.month.slice(0, 7) === month);
  const prev = data?.find((p) => p.month.slice(0, 7) === ymAdd(month, -1));
  const [items, setItems] = useState<PlanItem[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => { setItems(plan ? [...plan.plan_items].sort((a, b) => a.sort - b.sort) : []); setNotes(plan?.notes ?? ''); }, [plan]);

  const lead = ws.isLead;
  const locked = !lead || plan?.status === 'closed';
  const client = ws.clientById(clientId);

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try { await flush(); const r = await fn(); if (msg) toast(msg); reload(); ws.bump(); return r; } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const pending = useRef<Record<string, PlanItem>>({});
  const saveItem = (id: string) => {
    const next = pending.current[id];
    delete pending.current[id];
    clearTimeout(timers.current[id]);
    if (!next) return Promise.resolve();
    return api(`/api/plan-items/${id}`, { method: 'PATCH', json: {
      content_type: next.content_type, monthly_count: next.monthly_count, frequency: next.frequency,
      owner_id: next.owner_id, posting_time: next.posting_time.slice(0, 5), label: next.label,
    } }).catch((e) => toast(e.message));
  };
  /** Save edits still waiting on the debounce, so Activate/Regenerate/Copy use what's on screen. */
  const flush = () => Promise.all(Object.keys(pending.current).map(saveItem));

  function update(id: string, patch: Partial<PlanItem>) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    pending.current[id] = { ...(pending.current[id] ?? items.find((x) => x.id === id)!), ...patch };
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => saveItem(id), 400);
  }

  // live preview, computed with the same rules the server uses
  const preview: Record<string, ContentType[]> = {};
  const warnings: string[] = [];
  let total = 0;
  const totals: Partial<Record<ContentType, number>> = {};
  for (const i of items) {
    const { dates, warning } = itemDates(i, month);
    if (warning) warnings.push(`${TYPE_LABEL[i.content_type]}: ${warning}`);
    dates.forEach((d) => (preview[d] ||= []).push(i.content_type));
    total += dates.length;
    totals[i.content_type] = (totals[i.content_type] ?? 0) + dates.length;
  }
  const lead0 = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;

  const statusBadge = !plan ? <span className="badge grey nodot">No plan</span> : plan.status === 'draft' ? <span className="badge amber nodot">Draft plan</span>
    : plan.status === 'active' ? <span className="badge green nodot">Active plan</span> : <span className="badge grey nodot">Closed</span>;

  return <>
    <PageHead eyebrow="A little planning, a lot of possibility" title="Give next month a head start." sub="Build the package. Preview the dates. Then set the team up for success."
      actions={plan && lead && <>
        <button className="btn" disabled={busy} onClick={() => act(() => api(`/api/plans/${plan.id}/copy-next`, { method: 'POST' }).then(() => setMonth(ymAdd(month, 1))), `Copied to ${fmtYM(ymAdd(month, 1))} as a draft`)}><Icon name="copy" />Copy to next month</button>
        {plan.status === 'draft' && <button className="btn primary" disabled={busy || !items.length} onClick={() => act(async () => {
          const r = await api<{ generation: { created: number } }>(`/api/plans/${plan.id}`, { method: 'PATCH', json: { status: 'active' } });
          toast(`Plan activated: ${r.generation.created} tasks created for the team`);
        })}><Icon name="check" />Activate plan</button>}
        {plan.status === 'active' && <button className="btn primary" disabled={busy} onClick={() => act(async () => {
          const r = await api<{ created: number; updated: number; deleted: number; kept: number }>(`/api/plans/${plan.id}/generate`, { method: 'POST' });
          toast(`Regenerated: ${r.created} new, ${r.updated} moved, ${r.deleted} removed, ${r.kept} kept`);
        })}><Icon name="refresh" />Regenerate tasks</button>}
      </>} />
    <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
      <div className="row wrap">
        <Select icon="user" value={clientId} onChange={setClientId} options={ws.clients.map((c) => [c.id, c.name] as [string, string])} />
        <label className="sel" style={{ paddingRight: 10 }}><Icon name="calendar" size={14} /><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ border: 0, outline: 'none', padding: '7px 0', fontSize: 12 }} /></label>
        {statusBadge}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>{plan ? `${total} deliverables · ` : ''}All times in IST</span>
    </div>
    {error && <ErrorBox error={error} />}
    {!data ? <Loading /> : !plan ? (
      <div className="card card-pad empty">
        <h3 style={{ marginBottom: 6 }}>No plan for {client?.name} in {fmtYM(month)} yet.</h3><p>Start fresh or build on last month.</p>
        {lead ? <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          {prev && <button className="btn primary" disabled={busy} onClick={() => act(() => api(`/api/clients/${clientId}/plans`, { method: 'POST', json: { month, copy_from: prev.id } }), 'Draft plan created')}><Icon name="copy" />Copy {MONTHS[+prev.month.slice(5, 7) - 1]}’s package</button>}
          <button className="btn" disabled={busy} onClick={() => act(() => api(`/api/clients/${clientId}/plans`, { method: 'POST', json: { month } }), 'Draft plan created')}><Icon name="plus" />Start a blank plan</button>
        </div> : <p>Only the lead or admin can create plans.</p>}
      </div>
    ) : (
      <div className="plan-layout">
        <div className="card">
          <div className="card-pad row" style={{ justifyContent: 'space-between' }}><div><h3>The monthly package</h3><div className="sub">One clear plan for {client?.name}.</div></div>{client && <ClientLogo client={client} />}</div>
          {items.map((i) => {
            const f = i.frequency;
            return <div key={i.id} className="pitem">
              <div className="pgrid">
                <div className="field"><label>Content type</label><select value={i.content_type} disabled={locked} onChange={(e) => update(i.id, { content_type: e.target.value as ContentType })}>{CONTENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></div>
                <div className="field"><label>{f.mode === 'per_week' ? 'Per week' : 'Per month'}</label>
                  {f.mode === 'dates' ? <input value={f.dates.length} disabled />
                    : f.mode === 'per_week' ? <input type="number" min={0} max={7} value={f.count} disabled={locked} onChange={(e) => update(i.id, { frequency: { ...f, count: Math.max(0, +e.target.value) } })} />
                    : <input type="number" min={0} max={62} value={i.monthly_count} disabled={locked} onChange={(e) => update(i.id, { monthly_count: Math.max(0, +e.target.value) })} />}</div>
                <div className="field"><label>Posting rhythm</label><select value={f.mode} disabled={locked} onChange={(e) => update(i.id, { frequency: defaultFreq(e.target.value as Frequency['mode']) })}>{RHYTHM.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select></div>
                {!locked ? <button className="icon-btn" title="Remove line" onClick={() => { if (confirm('Remove this line? Its untouched future tasks are removed too.')) act(() => api(`/api/plan-items/${i.id}`, { method: 'DELETE' }), 'Line removed'); }}><Icon name="trash" /></button> : <span />}
              </div>
              {(f.mode === 'weekdays' || f.mode === 'per_week') && <div className="days">{WEEK.map((d) => (
                <button key={d} className={f.days.includes(d) ? 'on' : ''} disabled={locked} onClick={() => update(i.id, { frequency: { ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] } })}>{d[0]}</button>
              ))}</div>}
              {f.mode === 'dates' && <>
                <div className="row" style={{ marginTop: 10 }}><input type="date" className="input" style={{ width: 'auto' }} disabled={locked} min={`${month}-01`} max={`${month}-${daysInMonth(month)}`}
                  onChange={(e) => { const v = e.target.value; if (v) { const dates = [...new Set([...f.dates, v])].sort(); update(i.id, { frequency: { ...f, dates }, monthly_count: dates.length }); } }} /><small>Pick dates to add</small></div>
                <div className="date-chips">{f.dates.map((d) => <span key={d}>{fmtD(d)}{!locked && <button onClick={() => { const dates = f.dates.filter((x) => x !== d); update(i.id, { frequency: { ...f, dates }, monthly_count: dates.length }); }}>×</button>}</span>)}</div>
              </>}
              <div className="pgrid2">
                <div className="field"><label>Owner</label><select value={i.owner_id ?? ''} disabled={locked} onChange={(e) => update(i.id, { owner_id: e.target.value || null })}><option value="">Unassigned</option>{ws.staff.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div className="field"><label>Posting time · IST</label><input type="time" value={i.posting_time.slice(0, 5)} disabled={locked} onChange={(e) => e.target.value && update(i.id, { posting_time: e.target.value })} /></div>
              </div>
            </div>;
          })}
          <div className="pitem">
            {!locked && <button className="btn" disabled={busy} onClick={() => act(() => api(`/api/plans/${plan.id}/items`, { method: 'POST', json: {
              content_type: 'poster', monthly_count: 4, frequency: { mode: 'spread' }, owner_id: null, posting_time: '18:00', sort: items.length,
            } }))}><Icon name="plus" />Add content line</button>}
            <div className="field" style={{ marginTop: 12 }}><label>Plan notes</label>
              <textarea value={notes} disabled={locked} placeholder="Campaigns, launches, festivals..." onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (plan.notes ?? '') && api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { notes } }).catch((e) => toast(e.message))} /></div>
          </div>
        </div>
        <div>
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: 'space-between' }}><div><h3>{fmtYM(month)}</h3><div className="sub">Your calendar takes shape as you plan.</div></div><span className="badge nodot grey">{total} tasks</span></div>
            <div className="cal">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, k) => <div key={k} className="h">{x}</div>)}
              {Array.from({ length: lead0 }, (_, k) => <div key={`b${k}`} />)}
              {monthDays(month).map((d) => { const l = preview[d] ?? []; return <div key={d} title={l.map((t) => TYPE_LABEL[t]).join(', ')} className={`d ${l.length ? (l.length > 1 ? 'has has2' : 'has') : ''} ${d === today ? 'today' : ''}`}>{+d.slice(8)}{l.length > 0 && <small>{l.length} task{l.length > 1 ? 's' : ''}</small>}</div>; })}
            </div>
            <div className="row wrap" style={{ marginTop: 14, gap: 6 }}>{Object.entries(totals).map(([t, n]) => <span key={t} className="tag"><Icon name={t} size={11} />{typeCount(n!, t as ContentType)}</span>)}</div>
            {warnings.map((w) => <div key={w} className="warn-box">⚠ {w}</div>)}
          </div>
          <div className="info-bar" style={{ marginTop: 14 }}><Icon name="info" size={15} />{plan.status === 'draft' ? 'Preview the generated dates before activation. The team’s tasks are created when you activate.' : 'Regenerating only updates untouched future tasks. Work already in progress or posted is never moved.'}</div>
        </div>
      </div>
    )}
  </>;
}

export default function Page() { return <Suspense><Plans /></Suspense>; }
