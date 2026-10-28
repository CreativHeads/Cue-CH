'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { Avatar, ErrorBox, Loading, PageHead, Select, StageBadge, TypeIcon, useData } from '@/components/ui';
import { addDays, fmtD, fmtT, istDate, istTime, mondayOf, relDay, todayIST } from '@/lib/dates';
import { TYPE_LABEL, type Task } from '@/lib/types';

function MyTasks() {
  const ws = useWorkspace();
  const params = useSearchParams();
  const [who, setWho] = useState(params.get('owner') ?? (ws.isLead ? '' : ws.me.id));
  const [all, setAll] = useState(false);
  const owner = ws.isLead ? who : ws.me.id;
  const { data, error } = useData<Task[]>(`/api/tasks?${owner ? `owner=${owner}&` : ''}${all ? '' : 'open=true'}`, [ws.version]);

  const today = todayIST();
  const sunday = addDays(mondayOf(today), 6);
  const now = new Date();
  const sort = (a: Task[]) => a.sort((x, y) => Number(y.priority === 'high') - Number(x.priority === 'high') || x.due_at.localeCompare(y.due_at));
  const list = data ?? [];
  const overdue = (t: Task) => t.stage !== 'posted' && new Date(t.due_at) < now;
  const groups: [string, string, string, Task[]][] = [
    ['flag', 'Overdue', 'These need a little extra love.', sort(list.filter(overdue))],
    ['calendar', 'Today', `Your focus for ${fmtD(today)}.`, sort(list.filter((t) => !overdue(t) && t.stage !== 'posted' && istDate(t.due_at) === today))],
    ['clock', 'This week', 'Coming up before Sunday.', sort(list.filter((t) => t.stage !== 'posted' && istDate(t.due_at) > today && istDate(t.due_at) <= sunday))],
    ['calendar', 'Later', 'Further down the road.', sort(list.filter((t) => t.stage !== 'posted' && istDate(t.due_at) > sunday)).slice(0, 50)],
  ];
  if (all) groups.push(['checkc', 'Posted', 'Delivered and live.', list.filter((t) => t.stage === 'posted').sort((a, b) => b.due_at.localeCompare(a.due_at)).slice(0, 50)]);
  const open = list.filter((t) => t.stage !== 'posted').length;

  return <>
    <PageHead eyebrow="A clearer day starts here" title="Your next good work." sub="The right priorities, in the right order."
      actions={<button className="btn primary" onClick={() => ws.newTask()}><Icon name="plus" />New task</button>} />
    <div className="row wrap" style={{ justifyContent: 'space-between' }}>
      <div className="row">
        <Select icon="user" value={owner} onChange={setWho} disabled={!ws.isLead}
          options={ws.isLead ? [['', 'Team tasks · Admin view'], ...ws.staff.filter((s) => s.is_active).map((s) => [s.id, s.id === ws.me.id ? `${s.name} (me)` : s.name] as [string, string])] : [[ws.me.id, `${ws.me.name} (me)`]]} />
        <span className="muted" style={{ fontSize: 12.5 }}>{open} open tasks</span>
      </div>
      <div className="seg"><button className={!all ? 'on' : ''} onClick={() => setAll(false)}>Open tasks</button><button className={all ? 'on' : ''} onClick={() => setAll(true)}>All tasks</button></div>
    </div>
    {error && <ErrorBox error={error} />}
    {!data ? <Loading /> : <>
      {groups.map(([icon, name, sub, items]) => items.length > 0 && <div key={name}>
        <div className="section-title"><Icon name={icon} />{name} <span className="cnt">{items.length}</span><span className="muted">{sub}</span></div>
        <div className="card"><table className="ttable">
          <thead><tr><th>Content</th><th className="hide-m">Owner</th><th>Due</th><th>Stage</th><th className="hide-m" /></tr></thead>
          <tbody>{items.map((t) => <tr key={t.id} className="click" onClick={() => ws.openTask(t.id)}>
            <td><div className="tt"><TypeIcon type={t.content_type} /><div><b>{t.title}</b><small className="muted">{ws.clientById(t.client_id)?.name} · {TYPE_LABEL[t.content_type]}{t.priority === 'high' && <> · <span className="overdue-txt">High priority</span></>}{t.carried_over_from && ' · Carried over'}</small></div></div></td>
            <td className="hide-m"><div className="row"><Avatar staff={ws.staffById(t.owner_id)} sm />{ws.staffById(t.owner_id)?.name ?? 'Unassigned'}</div></td>
            <td className="due"><span className={overdue(t) ? 'overdue-txt' : ''}>{relDay(istDate(t.due_at), today)}<br /><small className={overdue(t) ? 'overdue-txt' : 'muted'}>{fmtT(istTime(t.due_at))}</small></span></td>
            <td><StageBadge stage={t.stage} /></td>
            <td className="hide-m chev"><Icon name="chev" size={16} /></td>
          </tr>)}</tbody>
        </table></div>
      </div>)}
      {groups.every((g) => !g[3].length) && <div className="card empty" style={{ marginTop: 20 }}>No tasks here yet.</div>}
    </>}
  </>;
}

export default function Page() { return <Suspense><MyTasks /></Suspense>; }
