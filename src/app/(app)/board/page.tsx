'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { api, Avatar, ErrorBox, Loading, PageHead, Select, toast, useData } from '@/components/ui';
import { addDays, daysInMonth, fmtT, istDate, istTime, mondayOf, relDay, todayIST, ymOf } from '@/lib/dates';
import { CONTENT_TYPES, STAGES, STAGE_LABEL, TYPE_LABEL, type Stage, type Task } from '@/lib/types';

const DOT: Record<Stage, string> = { to_brief: '#a9aea9', designing: '#8b80cf', client_review: '#d9a249', approved: '#7aa954', scheduled: '#7d8fd0', posted: '#215c46' };

function Board() {
  const ws = useWorkspace();
  const params = useSearchParams();
  const today = todayIST();
  const [client, setClient] = useState(params.get('client') ?? '');
  const [owner, setOwner] = useState('');
  const [type, setType] = useState('');
  const [problems, setProblems] = useState(false);
  const [range, setRange] = useState(params.get('q') ? 'all' : 'week');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  const ym = ymOf(today);
  const [from, to] = range === 'week' ? [addDays(mondayOf(today), -14), addDays(mondayOf(today), 6)]
    : range === 'month' ? [`${ym}-01`, `${ym}-${daysInMonth(ym)}`] : [null, null];
  const url = `/api/tasks?${client ? `client=${client}&` : ''}${owner ? `owner=${owner}&` : ''}${from ? `from=${from}&to=${to}` : ''}`;
  const { data, error, setData, reload } = useData<Task[]>(url, [ws.version]);

  const now = new Date();
  const weekStart = mondayOf(today);
  const tasks = (data ?? []).filter((t) => {
    const overdue = t.stage !== 'posted' && new Date(t.due_at) < now;
    if (range === 'week' && istDate(t.due_at) < weekStart && !overdue) return false; // earlier weeks: only what's still overdue
    if (type && t.content_type !== type) return false;
    if (problems && !overdue && t.priority !== 'high') return false;
    if (q && !`${t.title} ${ws.clientById(t.client_id)?.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  async function move(t: Task, stage: Stage) {
    if (stage === t.stage) return;
    if (stage === 'posted') { ws.openTask(t.id); toast('Paste the Instagram link to mark it posted'); return; }
    setData((d) => d?.map((x) => (x.id === t.id ? { ...x, stage } : x)) ?? null);
    try { await api(`/api/tasks/${t.id}`, { method: 'PATCH', json: { stage } }); toast(`Moved to ${STAGE_LABEL[stage]}`); }
    catch (e) { toast((e as Error).message); reload(); }
  }

  return <>
    <PageHead eyebrow="Make room for great work" title="A place for every idea." sub="From the first brief to the final post. Keep it moving."
      actions={!ws.isViewer && <button className="btn primary" onClick={() => ws.newTask(undefined, client || undefined)}><Icon name="plus" />New task</button>} />
    <div className="row wrap" style={{ marginBottom: 10 }}>
      <Select icon="clients" value={client} onChange={setClient} options={[['', 'All clients'], ...ws.clients.map((c) => [c.id, c.name] as [string, string])]} />
      <Select icon="user" value={owner} onChange={setOwner} options={[['', 'All owners'], ...ws.staff.filter((s) => s.is_active).map((s) => [s.id, s.name] as [string, string])]} />
      <Select icon="overview" value={type} onChange={setType} options={[['', 'All content types'], ...CONTENT_TYPES.map((t) => [t, TYPE_LABEL[t]] as [string, string])]} />
      <button className={`chip-btn ${problems ? 'on' : ''}`} onClick={() => setProblems(!problems)}><Icon name="flag" size={14} />Only problems</button>
    </div>
    <div className="row wrap">
      <Select icon="calendar" value={range} onChange={setRange} options={[['week', 'This week + overdue'], ['month', 'This month'], ['all', 'All dates']]} />
      <label className="search-in"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a task..." /></label>
    </div>
    <div className="info-bar"><Icon name="info" size={15} />Drag a card to change its stage, or open it for the brief, feedback and next steps. Scheduled is a tracking stage; publishing happens outside this workspace.</div>
    {error && <ErrorBox error={error} />}
    {!data ? <Loading /> : <div className="board">
      {STAGES.map((s) => {
        const list = tasks.filter((t) => t.stage === s).sort((x, y) => Number(!!y.carried_over_from) - Number(!!x.carried_over_from) || Number(y.priority === 'high') - Number(x.priority === 'high') || x.due_at.localeCompare(y.due_at));
        return <div key={s} className={`col ${dragOver === s ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(s); }} onDragLeave={() => setDragOver(null)}
          onDrop={(e) => { e.preventDefault(); setDragOver(null); const t = data.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (t) move(t, s); }}>
          <div className="col-head"><i style={{ background: DOT[s] }} />{STAGE_LABEL[s]} <span className="cnt">{list.length}</span>{s !== 'posted' && !ws.isViewer && <button onClick={() => ws.newTask(s, client || undefined)} title="Add task">+</button>}</div>
          {list.slice(0, 80).map((t) => {
            const overdue = t.stage !== 'posted' && new Date(t.due_at) < now;
            const editable = ws.canEdit(t);
            return <div key={t.id} className={`kcard ${editable ? '' : 'locked'}`} draggable={editable}
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.currentTarget.classList.add('dragging'); }}
              onDragEnd={(e) => e.currentTarget.classList.remove('dragging')} onClick={() => ws.openTask(t.id)}>
              <div className="cl"><span>{ws.clientById(t.client_id)?.name}</span>
                {editable && <button className="more-btn" aria-label="Move card" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === t.id ? null : t.id); }}>···</button>}</div>
              {menuFor === t.id && <div className="menu" onClick={(e) => e.stopPropagation()}>
                {STAGES.indexOf(t.stage) < 5 && <button onClick={() => { setMenuFor(null); move(t, STAGES[STAGES.indexOf(t.stage) + 1]); }}>Move to {STAGE_LABEL[STAGES[STAGES.indexOf(t.stage) + 1]]}</button>}
                {STAGES.indexOf(t.stage) > 0 && <button onClick={() => { setMenuFor(null); move(t, STAGES[STAGES.indexOf(t.stage) - 1]); }}>Back to {STAGE_LABEL[STAGES[STAGES.indexOf(t.stage) - 1]]}</button>}
                <button onClick={() => { setMenuFor(null); ws.openTask(t.id); }}>Open details</button>
              </div>}
              <h4>{t.title}</h4>
              <div className="tags"><span className="tag"><Icon name={t.content_type} size={11} />{TYPE_LABEL[t.content_type]}</span>
                {t.priority === 'high' && <span className="tag high">High priority</span>}{t.carried_over_from && <span className="tag carry">Carried over</span>}</div>
              <div className="foot"><span className={overdue ? 'overdue-txt' : ''}>{relDay(istDate(t.due_at), today)} · {fmtT(istTime(t.due_at))}</span><Avatar staff={ws.staffById(t.owner_id)} sm /></div>
            </div>;
          })}
          {list.length > 80 && <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>+{list.length - 80} more · narrow the filters</div>}
        </div>;
      })}
    </div>}
  </>;
}

export default function Page() { return <Suspense><Board /></Suspense>; }
