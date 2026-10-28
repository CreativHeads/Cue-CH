'use client';
import { useEffect, useState } from 'react';
import { useWorkspace } from './AppShell';
import { Icon } from './Icon';
import { api, Avatar, toast, TypeIcon, useData } from './ui';
import { diffDays, fmtD, istDate, istTime, todayIST } from '@/lib/dates';
import { CONTENT_TYPES, STAGES, STAGE_LABEL, TYPE_LABEL, type Stage, type Task, type TaskEvent } from '@/lib/types';

interface Detail { task: Task; events: TaskEvent[]; post: { permalink: string; reach: number; likes: number; comments: number; saves: number } | null }
const FLAGS = ['swapped_type', 'collab', 'deleted', 'late'] as const;

function describe(e: TaskEvent, name: (id: string | null) => string) {
  switch (e.type) {
    case 'stage_change': return e.from_value ? `Stage changed from ${STAGE_LABEL[e.from_value as Stage]} to ${STAGE_LABEL[e.to_value as Stage]}.` : `Task created in ${STAGE_LABEL[e.to_value as Stage]}.`;
    case 'reassign': return `Reassigned from ${name(e.from_value)} to ${name(e.to_value)}.`;
    case 'manual_post': return 'Marked posted by hand. Waiting for Instagram confirmation.';
    case 'match': return e.to_value?.startsWith('manual') ? 'Matched to an Instagram post by hand.' : 'Confirmed live on Instagram and matched automatically.';
    case 'unmatch': return e.to_value === 'deleted on Instagram' ? 'The post was removed from Instagram; back to Scheduled.' : 'Post detached; back to Scheduled.';
    case 'edit': return 'Due date changed.';
    default: return e.to_value ?? e.type;
  }
}

export function TaskDrawer({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const ws = useWorkspace();
  const { data, error, reload } = useData<Detail>(`/api/tasks/${id}`);
  const [form, setForm] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setOpen(true)); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  useEffect(() => {
    if (!data) return;
    const t = data.task;
    setForm({ title: t.title, stage: t.stage, owner_id: t.owner_id ?? '', content_type: t.content_type, due_date: istDate(t.due_at), posting_time: istTime(t.due_at), priority: t.priority, brief: t.brief ?? '' });
    setFlags(t.flags);
  }, [data]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast(msg); reload(); onChange(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const t = data?.task;
  const client = t ? ws.clientById(t.client_id) : undefined;
  const edit = t ? ws.canEdit(t) : false;
  const lead = ws.isLead;
  const name = (sid: string | null) => ws.staffById(sid)?.name ?? 'Unassigned';
  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const overdue = t && t.stage !== 'posted' && new Date(t.due_at) < new Date();
  const lateBy = t ? diffDays(todayIST(), istDate(t.due_at)) : 0;
  const nextStage = t && t.stage !== 'posted' ? STAGES[STAGES.indexOf(t.stage) + 1] : null;

  const save = () => run(() => api(`/api/tasks/${id}`, { method: 'PATCH', json: {
    title: form.title, brief: form.brief, priority: form.priority, ...(form.stage !== t!.stage && form.stage !== 'posted' ? { stage: form.stage } : {}),
    ...(lead ? { owner_id: form.owner_id || null, content_type: form.content_type, due_date: form.due_date, posting_time: form.posting_time, flags } : {}),
  } }), 'Changes saved');

  return (
    <>
      <div className={`overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`}>
        {!t ? <div className="drawer-body">{error ? <div className="alert red">{error}</div> : 'Loading…'}</div> : <>
          <div className="drawer-head"><TypeIcon type={t.content_type} /><span>{TYPE_LABEL[t.content_type]} / {client?.name}</span><span className="spacer" />
            <button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
          <div className="drawer-body">
            {t.stage === 'posted' && <div className="alert ok"><Icon name="checkc" />{t.delivery === 'manual_unverified' ? 'Marked posted by hand. It will be verified when the post shows up on Instagram.' : `Live on Instagram${t.delivery === 'late' ? ' (posted late)' : ''}.`}</div>}
            {overdue && <div className="alert warn"><Icon name="flag" />This task is overdue{lateBy > 0 ? ` by ${lateBy} day${lateBy > 1 ? 's' : ''}` : ''}. Let’s get it back on track.</div>}
            {t.carried_over_from && t.stage !== 'posted' && <div className="alert warn"><Icon name="flag" />Carried over from the week of {fmtD(t.carried_over_from)}.</div>}
            {!edit && <div className="alert info"><Icon name="info" />Only {name(t.owner_id)} or the creative lead can edit this task.</div>}

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="eyebrow">{client?.name} · {TYPE_LABEL[t.content_type]}{t.plan_item_id ? ` · #${t.seq}` : ' · Manual task'}</span>
              {t.priority === 'high' && <span className="badge high nodot">High priority</span>}
            </div>
            <input className="input" style={{ fontSize: 20, fontWeight: 600, borderColor: 'transparent', padding: '6px 0', marginTop: 6 }} value={form.title ?? ''} onChange={set('title')} disabled={!edit} />

            <div className="kv">
              <label>Stage</label>
              <select value={form.stage} onChange={set('stage')} disabled={!edit}>{STAGES.filter((s) => s !== 'posted' || t.stage === 'posted').map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select>
              <label>Assigned to</label>
              <select value={form.owner_id} onChange={set('owner_id')} disabled={!lead}><option value="">Unassigned</option>{ws.staff.filter((s) => s.is_active || s.id === t.owner_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <label>Content type</label>
              <select value={form.content_type} onChange={set('content_type')} disabled={!lead}>{CONTENT_TYPES.map((c) => <option key={c} value={c}>{TYPE_LABEL[c]}</option>)}</select>
              <label>Due date</label><input type="date" value={form.due_date ?? ''} onChange={set('due_date')} disabled={!lead} />
              <label>Posting time</label><div className="row"><input type="time" value={form.posting_time ?? ''} onChange={set('posting_time')} disabled={!lead} /><small>IST</small></div>
              <label>Priority</label>
              <select value={form.priority} onChange={set('priority')} disabled={!edit}><option value="normal">Normal</option><option value="high">High priority</option></select>
            </div>

            <div className="dsec"><h4>The creative brief <small>{edit ? 'Editable' : 'Read only'}</small></h4>
              <textarea className="input" rows={5} value={form.brief ?? ''} onChange={set('brief')} disabled={!edit} /></div>

            {data.post && <div className="dsec"><h4>Matched post <span className={`badge ${t.delivery === 'late' ? 'amber' : 'green'}`}>{t.delivery === 'late' ? 'Late' : 'On time'}</span></h4><div className="metrics">
              <div><b>{data.post.reach ?? '—'}</b><small>Reach</small></div><div><b>{data.post.likes ?? '—'}</b><small>Likes</small></div>
              <div><b>{data.post.comments ?? '—'}</b><small>Comments</small></div><div><b>{data.post.saves ?? '—'}</b><small>Saves</small></div></div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}><a className="link-btn" style={{ color: 'var(--green)' }} href={data.post.permalink} target="_blank" rel="noopener noreferrer">View on Instagram</a>
              {lead && <button className="btn sm" disabled={busy} onClick={() => { if (confirm('Detach this post? The task goes back to Scheduled and the post to the review queue.')) run(() => api(`/api/tasks/${id}/unmatch`, { method: 'POST' }), 'Post detached'); }}>Unmatch</button>}</div></div>}
            {t.stage === 'posted' && !data.post && t.permalink && <div className="dsec"><h4>Posted link</h4><a className="link-btn" style={{ color: 'var(--green)' }} href={t.permalink} target="_blank" rel="noopener noreferrer">{t.permalink}</a></div>}

            {t.stage !== 'posted' && edit && <div className="dsec"><h4>Mark posted by hand</h4>
              <div className="row"><input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder={`Paste the Instagram link${t.content_type === 'story' ? ' (optional for stories)' : ''}`} />
                <button className="btn sm primary" disabled={busy} onClick={() => run(() => api(`/api/tasks/${id}/mark-posted`, { method: 'POST', json: { permalink: link.trim() || null } }), 'Marked posted')}><Icon name="insta" size={14} /> Mark posted</button></div>
              <small>Use this only if the automatic check hasn’t picked it up.</small></div>}

            <div className="dsec"><h4>Flags</h4><div className="flagset">{FLAGS.map((f) => (
              <label key={f}><input type="checkbox" checked={flags.includes(f)} disabled={!lead} onChange={(e) => setFlags((x) => e.target.checked ? [...x, f] : x.filter((y) => y !== f))} />{f.replace('_', ' ')}</label>
            ))}</div></div>

            <div className="dsec"><h4>Feedback & notes <span className="badge nodot grey">{data.events.filter((e) => e.type === 'note').length}</span></h4>
              {data.events.filter((e) => e.type === 'note').map((e) => (
                <div className="note" key={e.id}><Avatar staff={ws.staffById(e.actor_id)} sm /><div className="bubble">{e.to_value}<small>{name(e.actor_id)} · {new Date(e.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></div></div>
              ))}
              <form className="row" onSubmit={(e) => { e.preventDefault(); if (note.trim()) run(() => api(`/api/tasks/${id}/notes`, { method: 'POST', json: { text: note } }).then(() => setNote('')), 'Note added'); }}>
                <Avatar staff={ws.me} sm /><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note or link..." /><button className="btn sm">Add note</button></form></div>

            <div className="dsec"><h4>Activity</h4>{[...data.events].filter((e) => e.type !== 'note').reverse().map((e) => (
              <div className="ev" key={e.id}><i /><div>{describe(e, name)}<small>{e.actor_id ? name(e.actor_id) : 'System'} · {new Date(e.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></div></div>
            ))}</div>

            {lead && <div className="dsec"><button className="btn sm danger" onClick={() => { if (confirm('Delete this task?')) run(() => api(`/api/tasks/${id}`, { method: 'DELETE' }).then(onClose), 'Task deleted'); }}><Icon name="trash" size={14} /> Delete task</button></div>}
          </div>
          <div className="drawer-foot">
            <button className="btn" disabled={!edit || busy} onClick={save}><Icon name="check" size={15} /> Save changes</button>
            {nextStage && nextStage !== 'posted' && edit && <button className="btn primary" disabled={busy} onClick={() => run(() => api(`/api/tasks/${id}`, { method: 'PATCH', json: { stage: nextStage } }), `Moved to ${STAGE_LABEL[nextStage]}`)}>
              <Icon name="arrow" size={15} /> Move to {STAGE_LABEL[nextStage]}</button>}
          </div>
        </>}
      </div>
    </>
  );
}
