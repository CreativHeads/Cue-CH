'use client';
import { useState } from 'react';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { api, ErrorBox, Loading, PageHead, toast, useData } from '@/components/ui';
import { addDays, diffDays, fmtD, fmtT, istDate, istTime } from '@/lib/dates';
import { TYPE_LABEL, type ContentType, type Task } from '@/lib/types';

interface Post {
  id: string; client_id: string; content_type: ContentType; posted_at: string; permalink: string | null; thumbnail_url: string | null;
  caption: string | null; reach: number | null; likes: number | null; comments: number | null; status: string; match_score: number | null;
  manual: boolean; is_story: boolean; task_id: string | null; task_title: string | null; task_type: ContentType | null; task_due_at: string | null; task_owner: string | null;
}
const TABS: [string, string][] = [['pending_review', 'Needs review'], ['extra', 'Extras'], ['resolved', 'Resolved']];

export default function Review() {
  const ws = useWorkspace();
  const [tab, setTab] = useState('pending_review');
  const { data, error, reload } = useData<Post[]>(`/api/posts?status=${tab}`, [ws.version]);
  const counts = useData<Post[]>('/api/posts?status=pending_review', [ws.version]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); reload(); counts.reload(); ws.bump(); } catch (e) { toast((e as Error).message); }
  };

  return <>
    <PageHead eyebrow="A human touch goes a long way" title="Let’s connect the dots." sub="Instagram posts that need a little help finding their planned task." />
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
      <div className="seg">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'pending_review' && counts.data ? ` · ${counts.data.length}` : ''}</button>)}</div>
      <span className="muted" style={{ fontSize: 12 }}>Checked automatically every few hours</span>
    </div>
    {error && <ErrorBox error={error} />}
    {!data ? <Loading /> : !data.length ? <div className="card empty">{tab === 'pending_review' ? 'Nothing to review. Every post found its task. 🎉' : tab === 'extra' ? 'No unplanned posts.' : 'No manual decisions yet.'}</div>
      : data.map((p) => <ReviewCard key={p.id} p={p} lead={ws.isLead} act={act} />)}
  </>;
}

function ReviewCard({ p, lead, act }: { p: Post; lead: boolean; act: (fn: () => Promise<unknown>, msg: string) => void }) {
  const ws = useWorkspace();
  const client = ws.clientById(p.client_id);
  const [choosing, setChoosing] = useState(false);
  const day = istDate(p.posted_at);
  const options = useData<Task[]>(choosing ? `/api/tasks?client=${p.client_id}&from=${addDays(day, -10)}&to=${addDays(day, 4)}&open=true` : null);
  const suggested = p.status === 'pending_review' && p.task_id;
  let why = '';
  if (suggested && p.task_due_at && p.task_type) {
    const dd = diffDays(day, istDate(p.task_due_at));
    why = p.task_type !== p.content_type ? `Posted as a ${TYPE_LABEL[p.content_type].toLowerCase()}; the plan expects a ${TYPE_LABEL[p.task_type].toLowerCase()}.`
      : dd > 0 ? `Posted ${dd} day${dd > 1 ? 's' : ''} after the planned date.` : dd < 0 ? `Posted ${-dd} day${dd < -1 ? 's' : ''} before the planned date.` : 'Close match. Please confirm.';
  } else if (p.status === 'extra') why = 'No planned task fits this post, so it counts as extra content.';
  else if (p.status === 'ignored') why = 'Ignored. Not counted anywhere.';
  else if (p.status === 'matched') why = `Matched${p.manual ? ' by hand' : ''} to “${p.task_title ?? 'a task'}”.`;
  else why = 'No suggestion. Choose the task it delivers, or keep it as extra.';

  return (
    <div className="card rcard">
      <a className="thumb" href={p.permalink ?? '#'} target="_blank" rel="noopener noreferrer" style={{ background: p.thumbnail_url ? `center/cover url(${p.thumbnail_url})` : `linear-gradient(135deg, ${client?.brand_color ?? '#eaf3e0'}, #fff)` }}>
        {!p.thumbnail_url && <><small>{client?.name}</small>{(p.caption ?? TYPE_LABEL[p.content_type]).split(/\s+/).slice(0, 4).join(' ')}<small>@{client?.ig_username}</small></>}
      </a>
      <div>
        <div className="row" style={{ gap: 8 }}><span className="badge nodot grey">{TYPE_LABEL[p.content_type]}</span><small>{fmtD(day)} · {fmtT(istTime(p.posted_at))}</small></div>
        <h3 style={{ fontSize: 15, margin: '10px 0 4px' }}>{(p.caption ?? '').split('\n')[0].slice(0, 90) || 'No caption'}</h3>
        <small style={{ display: 'block' }}>{client?.name}</small>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0' }}>{why}</p>
        <small><Icon name="insta" size={12} /> {p.reach != null ? `${p.reach.toLocaleString('en-IN')} reached` : 'Reach pending'}{p.likes != null ? ` · ${p.likes} likes` : ''}</small>
      </div>
      <div className="match-box">
        {suggested ? <><div className="eyebrow">Suggested match{p.match_score != null ? ` · ${p.match_score}%` : ''}</div><b>{p.task_title}</b><small>{TYPE_LABEL[p.task_type!]} · {fmtD(istDate(p.task_due_at!))} · {ws.staffById(p.task_owner)?.name ?? 'Unassigned'}</small></>
          : p.status === 'matched' || p.status === 'ignored' ? <><div className="eyebrow">Resolved</div><b>{p.status === 'ignored' ? 'Ignored' : p.task_title}</b></>
          : <><div className="eyebrow">No suggested match</div><b>Unplanned {TYPE_LABEL[p.content_type].toLowerCase()}</b></>}
        {!lead ? <small className="muted" style={{ display: 'block', marginTop: 8 }}>Only the lead or admin can resolve posts.</small>
          : p.status === 'pending_review' || p.status === 'extra' ? <div className="acts">
            {suggested && <button className="btn primary sm" onClick={() => act(() => api(`/api/posts/${p.id}/match`, { method: 'POST', json: { task_id: p.task_id } }), 'Matched')}><Icon name="check" size={14} />Confirm match</button>}
            {!choosing ? <button className="btn sm" onClick={() => setChoosing(true)}>{suggested ? 'Choose another' : 'Match to task'}</button>
              : <select className="input" style={{ width: 'auto', fontSize: 11.5, padding: 6 }} defaultValue="" onChange={(e) => e.target.value && act(() => api(`/api/posts/${p.id}/match`, { method: 'POST', json: { task_id: e.target.value } }), 'Matched')}>
                <option value="">{options.data ? 'Pick the task…' : 'Loading…'}</option>
                {(options.data ?? []).sort((a, b) => Math.abs(diffDays(day, istDate(a.due_at))) - Math.abs(diffDays(day, istDate(b.due_at)))).slice(0, 40).map((t) =>
                  <option key={t.id} value={t.id}>{t.title} · {TYPE_LABEL[t.content_type]} · {fmtD(istDate(t.due_at))}</option>)}
              </select>}
            {p.status !== 'extra' && <button className="btn sm" onClick={() => act(() => api(`/api/posts/${p.id}/status`, { method: 'POST', json: { status: 'extra' } }), 'Kept as extra content')}>Mark extra</button>}
            <button className="btn sm ghost" onClick={() => act(() => api(`/api/posts/${p.id}/status`, { method: 'POST', json: { status: 'ignored' } }), 'Post ignored')}>Ignore</button>
          </div>
          : <div className="acts"><button className="btn sm" onClick={() => act(() => api(`/api/posts/${p.id}/status`, { method: 'POST', json: { status: 'pending_review' } }), 'Back in review')}>Undo</button></div>}
      </div>
    </div>
  );
}
