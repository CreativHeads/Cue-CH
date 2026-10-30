'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { api, Avatar, ClientLogo, ErrorBox, Loading, PageHead, Select, toast, useData } from '@/components/ui';
import { daysInMonth, dow, DOWS, fmtD, fmtT, fmtYM, istDate, istTime, monthDays, MONTHS, todayIST, ymAdd, ymOf } from '@/lib/dates';
import { itemDates } from '@/lib/generation';
import { specialDays } from '@/lib/specialDays';
import { CONTENT_TYPES, CONTENT_TYPE_COLORS, STAGE_LABEL, TYPE_LABEL, typeCount, type ContentType, type Frequency, type Plan, type PlanItem, type Task, type Weekday } from '@/lib/types';

const WEEK: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const RHYTHM: [Frequency['mode'], string][] = [
  ['spread', 'Spread evenly'],
  ['per_week', 'Per week'],
  ['weekdays', 'Specific days of week'],
  ['dates', 'Fixed dates'],
];
type PlanWithItems = Plan & { plan_items: PlanItem[] };

const CAL_TYPE_LABEL: Record<ContentType, string> = {
  reel: 'Reel',
  poster: 'Poster',
  special_days_poster: 'Spl. Poster',
  story: 'Story',
  carousel: 'Carousel',
  creative_reel: 'Creative',
  presentation_video: 'Pres. Video',
  video: 'Video',
  other: 'Other',
};

function defaultFreq(mode: Frequency['mode']): Frequency {
  if (mode === 'weekdays') return { mode, days: ['TUE', 'FRI'] };
  if (mode === 'per_week') return { mode, count: 3, days: ['MON', 'WED', 'FRI'] };
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
  const [showSpecial, setShowSpecial] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('plans.specialDays') === '0') setShowSpecial(false); } catch {} }, []);
  const toggleSpecial = () => setShowSpecial((v) => { try { localStorage.setItem('plans.specialDays', v ? '0' : '1'); } catch {} return !v; });
  const special = showSpecial ? specialDays(month) : {};
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [clientId, month]);
  const { data: monthTasks } = useData<Task[]>(clientId && plan && plan.status !== 'draft' ? `/api/tasks?client=${clientId}&from=${month}-01&to=${month}-${daysInMonth(month)}` : null, [ws.version]);

  useEffect(() => {
    if (!plan) {
      setItems([]);
      setNotes('');
      return;
    }
    const cleanItems = [...plan.plan_items]
      .sort((a, b) => a.sort - b.sort)
      .map((it) => {
        const f = it.frequency;
        if (f.mode === 'per_week' && f.days.length > f.count) {
          return { ...it, frequency: { ...f, days: f.days.slice(0, f.count) } };
        }
        if (f.mode === 'weekdays') {
          const expectedCount = monthDays(month).filter((d) => f.days.includes(DOWS[dow(d)])).length;
          if (it.monthly_count !== expectedCount) {
            return { ...it, monthly_count: expectedCount };
          }
        }
        return it;
      });
    setItems(cleanItems);
    setNotes(plan.notes ?? '');
  }, [plan]);

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
  const previewItems: Record<string, PlanItem[]> = {};
  const warnings: string[] = [];
  let total = 0;
  const totals: Partial<Record<ContentType, number>> = {};
  for (const i of items) {
    const { dates, warning } = itemDates(i, month);
    if (warning) warnings.push(`${TYPE_LABEL[i.content_type]}: ${warning}`);
    dates.forEach((d) => { (preview[d] ||= []).push(i.content_type); (previewItems[d] ||= []).push(i); });
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
        <label className="sel no-arrow" style={{ paddingRight: 8 }}><Icon name="calendar" size={14} /><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ border: 0, outline: 'none', padding: '6px 0', fontSize: 12.5 }} /></label>
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
                    : f.mode === 'per_week' ? <input type="number" min={1} max={7} value={f.count} disabled={locked} onChange={(e) => {
                        const val = +e.target.value;
                        const count = Math.min(7, Math.max(1, isNaN(val) ? 1 : val));
                        let days = f.days;
                        if (days.length > count) days = days.slice(0, count);
                        update(i.id, { frequency: { ...f, count, days } });
                      }} />
                    : f.mode === 'weekdays' ? <input value={monthDays(month).filter((d) => f.days.includes(DOWS[dow(d)])).length} disabled title="Automatically calculated from selected days in this month" />
                    : <input type="number" min={0} max={62} value={i.monthly_count} disabled={locked} onChange={(e) => update(i.id, { monthly_count: Math.max(0, +e.target.value) })} />}</div>
                <div className="field"><label>Posting rhythm</label><select value={f.mode} disabled={locked} onChange={(e) => {
                  const mode = e.target.value as Frequency['mode'];
                  const newFreq = defaultFreq(mode);
                  if (newFreq.mode === 'weekdays') {
                    const count = monthDays(month).filter((day) => newFreq.days.includes(DOWS[dow(day)])).length;
                    update(i.id, { frequency: newFreq, monthly_count: count });
                  } else if (newFreq.mode === 'dates') {
                    update(i.id, { frequency: newFreq, monthly_count: 0 });
                  } else if (newFreq.mode === 'per_week') {
                    update(i.id, { frequency: newFreq });
                  } else {
                    update(i.id, { frequency: newFreq, monthly_count: i.monthly_count || 4 });
                  }
                }}>{RHYTHM.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select></div>
                {!locked ? <button className="icon-btn" title="Remove line" onClick={() => { if (confirm('Remove this line? Its untouched future tasks are removed too.')) act(() => api(`/api/plan-items/${i.id}`, { method: 'DELETE' }), 'Line removed'); }}><Icon name="trash" /></button> : <span />}
              </div>
              {(f.mode === 'weekdays' || f.mode === 'per_week') && <div>
                <div className="days">{WEEK.map((d) => (
                  <button
                    key={d}
                    type="button"
                    title={d}
                    className={f.days.includes(d) ? 'on' : ''}
                    disabled={locked}
                    onClick={() => {
                      if (f.mode === 'weekdays') {
                        const newDays = f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d];
                        const newCount = monthDays(month).filter((day) => newDays.includes(DOWS[dow(day)])).length;
                        update(i.id, { frequency: { ...f, days: newDays }, monthly_count: newCount });
                      } else if (f.mode === 'per_week') {
                        if (f.days.includes(d)) {
                          update(i.id, { frequency: { ...f, days: f.days.filter((x) => x !== d) } });
                        } else {
                          if (f.days.length >= f.count) {
                            toast(`Already selected ${f.count} day${f.count === 1 ? '' : 's'} for "${f.count} per week". Deselect a day first to change.`);
                            return;
                          }
                          update(i.id, { frequency: { ...f, days: [...f.days, d] } });
                        }
                      }
                    }}
                  >{d[0]}</button>
                ))}</div>
                {f.mode === 'per_week' && <small style={{ fontSize: 11, color: f.days.length < f.count ? '#d97706' : 'var(--muted)', display: 'block', marginTop: 4 }}>
                  {f.days.length === f.count
                    ? `${f.count} day${f.count === 1 ? '' : 's'} selected (${f.days.join(', ')})`
                    : `Selected ${f.days.length} of ${f.count} days. Pick ${f.count - f.days.length} more.`}
                </small>}
                {f.mode === 'weekdays' && <small style={{ fontSize: 11, color: f.days.length === 0 ? '#d97706' : 'var(--muted)', display: 'block', marginTop: 4 }}>
                  {f.days.length === 0
                    ? 'Select at least one day above.'
                    : `${monthDays(month).filter((day) => f.days.includes(DOWS[dow(day)])).length} posts in ${MONTHS[+month.slice(5, 7) - 1]} (every ${f.days.join(', ')})`}
                </small>}
              </div>}
              {f.mode === 'dates' && <>
                <div className="row" style={{ marginTop: 10 }}><input type="date" className="input" style={{ width: 'auto' }} disabled={locked} min={`${month}-01`} max={`${month}-${daysInMonth(month)}`}
                  onChange={(e) => { const v = e.target.value; if (v) { const dates = [...new Set([...f.dates, v])].sort(); update(i.id, { frequency: { ...f, dates }, monthly_count: dates.length }); } }} /><small>Pick dates to add</small></div>
                <div className="date-chips">{f.dates.map((d) => <span key={d}>{fmtD(d)}{!locked && <button onClick={() => { const dates = f.dates.filter((x) => x !== d); update(i.id, { frequency: { ...f, dates }, monthly_count: dates.length }); }}>×</button>}</span>)}</div>
              </>}
              <div style={{ marginTop: 10, maxWidth: 220 }}>
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
            <div className="row" style={{ justifyContent: 'space-between' }}><div><h3>{fmtYM(month)}</h3><div className="sub">Your calendar takes shape as you plan.</div></div><div className="row" style={{ gap: 6 }}>
              <button type="button" className={`sp-toggle${showSpecial ? ' on' : ''}`} onClick={toggleSpecial} title="Show Kerala and Indian special days"><i className="sp-dot" />Special days</button>
              <span className="badge nodot grey">{total} tasks</span>
            </div></div>
            <div className="cal">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, k) => <div key={k} className="h">{x}</div>)}
              {Array.from({ length: lead0 }, (_, k) => <div key={`b${k}`} />)}
              {monthDays(month).map((d) => {
                const l = preview[d] ?? [];
                const unique = Array.from(new Set(l));
                const singleCol = unique.length === 1 ? CONTENT_TYPE_COLORS[unique[0]] : null;
                const cellBg = singleCol
                  ? singleCol.bg
                  : unique.length > 1
                  ? `linear-gradient(135deg, ${unique.map((t, idx, arr) => {
                      const s = Math.round((idx / arr.length) * 100);
                      const e = Math.round(((idx + 1) / arr.length) * 100);
                      const bg = CONTENT_TYPE_COLORS[t]?.bg ?? '#f3f6fb';
                      return `${bg} ${s}%, ${bg} ${e}%`;
                    }).join(', ')})`
                  : undefined;
                const cellBorder = singleCol
                  ? `1.5px solid ${singleCol.border}`
                  : unique.length > 1
                  ? '1.5px solid #cbd5e1'
                  : undefined;
                const cellColor = singleCol
                  ? singleCol.text
                  : unique.length > 1
                  ? '#1e293b'
                  : undefined;

                const labelText = l.length === 1
                  ? (CAL_TYPE_LABEL[l[0]] ?? TYPE_LABEL[l[0]] ?? l[0])
                  : unique.length === 1
                  ? typeCount(l.length, l[0])
                  : l.length === 2
                  ? `${CAL_TYPE_LABEL[l[0]] ?? l[0]} + ${CAL_TYPE_LABEL[l[1]] ?? l[1]}`
                  : `${l.length} tasks`;

                const sp = special[d];
                return (
                  <div
                    key={d}
                    title={[...(sp ?? []), ...l.map((t) => TYPE_LABEL[t] ?? t)].join(', ')}
                    className={`d click ${l.length ? 'has' : ''} ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''}`}
                    onClick={() => setSel(d === sel ? null : d)}
                    style={l.length ? { background: cellBg, border: cellBorder, color: cellColor, fontWeight: 600 } : undefined}
                  >
                    {sp && <i className="sp-dot" />}
                    <span>{+d.slice(8)}</span>
                    {l.length > 0 && (
                      <>
                        <small className="cal-type-lbl" title={l.map((t) => TYPE_LABEL[t] ?? t).join(', ')}>
                          {labelText}
                        </small>
                        <div className="row" style={{ gap: 2, marginTop: 1 }}>
                          {l.map((t, idx) => (
                            <i key={idx} className={`cal-dot ${t}`} title={TYPE_LABEL[t] ?? t} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="row wrap" style={{ marginTop: 14, gap: 6 }}>
              {Object.entries(totals).map(([t, n]) => (
                <span key={t} className={`tag t-${t}`}>
                  <i className={`cal-dot ${t}`} style={{ width: 6, height: 6 }} />
                  <Icon name={t} size={11} />
                  {typeCount(n!, t as ContentType)}
                </span>
              ))}
            </div>
            {Object.keys(special).length > 0 && <div className="sp-list">
              {Object.entries(special).sort(([a], [b]) => a.localeCompare(b)).map(([d, names]) => (
                <div key={d}><i className="sp-dot" /><b>{fmtD(d)}</b>{names.join(' · ')}</div>
              ))}
            </div>}
            {warnings.map((w) => <div key={w} className="warn-box">⚠ {w}</div>)}
          </div>
          {sel && (() => {
            const dayTasks = (monthTasks ?? []).filter((t) => istDate(t.due_at) === sel);
            const planned = previewItems[sel] ?? [];
            const sp = specialDays(month)[sel] ?? [];
            return <div className="card day-panel" style={{ marginTop: 14 }}>
              <div className="card-pad row" style={{ justifyContent: 'space-between' }}>
                <div><h3>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow(sel)]}, {fmtD(sel)}</h3>
                  <div className="sub">{plan.status === 'draft' ? `${planned.length} planned` : `${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}`}{sel === today ? ' · Today' : ''}</div></div>
                <button className="icon-btn" title="Close" onClick={() => setSel(null)}>×</button>
              </div>
              {sp.length > 0 && <div className="day-special">{sp.map((n) => <span key={n}><i className="sp-dot" />{n}</span>)}</div>}
              {plan.status !== 'draft' ? (
                !monthTasks ? <Loading /> : dayTasks.length ? dayTasks.map((t) => (
                  <div key={t.id} className="list-item" onClick={() => ws.openTask(t.id)}>
                    <span className={`type-ic ${t.content_type}`}><Icon name={t.content_type} /></span>
                    <div className="t"><b>{t.title}</b><small className="muted">{TYPE_LABEL[t.content_type]} · {fmtT(istTime(t.due_at))} IST</small></div>
                    <Avatar staff={ws.staffById(t.owner_id)} sm />
                    <span className={`badge st-${t.stage}`}>{STAGE_LABEL[t.stage]}</span>
                  </div>
                )) : <div className="empty">No tasks on this day.</div>
              ) : planned.length ? planned.map((i, k) => (
                <div key={`${i.id}${k}`} className="list-item" style={{ cursor: 'default' }}>
                  <span className={`type-ic ${i.content_type}`}><Icon name={i.content_type} /></span>
                  <div className="t"><b>{TYPE_LABEL[i.content_type]}</b><small className="muted">{fmtT(i.posting_time)} IST · created when you activate the plan</small></div>
                </div>
              )) : <div className="empty">Nothing planned for this day.</div>}
            </div>;
          })()}
          <div className="info-bar" style={{ marginTop: 14 }}><Icon name="info" size={15} />{plan.status === 'draft' ? 'Preview the generated dates before activation. The team’s tasks are created when you activate.' : 'Regenerating only updates untouched future tasks. Work already in progress or posted is never moved.'}</div>
        </div>
      </div>
    )}
  </>;
}

export default function Page() { return <Suspense><Plans /></Suspense>; }
