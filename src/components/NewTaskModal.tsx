'use client';
import { useState } from 'react';
import { useWorkspace } from './AppShell';
import { api, Modal, toast } from './ui';
import { todayIST } from '@/lib/dates';
import { CONTENT_TYPES, STAGES, STAGE_LABEL, TYPE_LABEL, type Stage } from '@/lib/types';

export function NewTaskModal({ stage, clientId, onClose, onCreated }: { stage?: Stage; clientId?: string; onClose: () => void; onCreated: () => void }) {
  const ws = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = ws.clients.filter((c) => c.status === 'active');

  async function submit(form: HTMLFormElement) {
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true); setErr(null);
    try {
      await api('/api/tasks', { method: 'POST', json: {
        title: d.title, client_id: d.client_id, content_type: d.content_type, owner_id: ws.isLead ? d.owner_id || null : ws.me.id,
        stage: d.stage, due_date: d.due_date, posting_time: d.posting_time, brief: d.brief, priority: d.priority,
      } });
      toast('Task created'); onCreated(); onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title="A new idea starts here." onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={() => submit(document.getElementById('ntForm') as HTMLFormElement)}>Create task</button>
    </>}>
      <form id="ntForm" className="fgrid" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
        <div className="field full"><label>What are we creating?</label><input name="title" required autoFocus placeholder="e.g. A smile worth sharing" /></div>
        <div className="field"><label>Client</label><select name="client_id" defaultValue={clientId ?? active[0]?.id}>{active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Content type</label><select name="content_type" defaultValue="reel">{CONTENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></div>
        <div className="field"><label>Owner</label><select name="owner_id" disabled={!ws.isLead} defaultValue={ws.me.id}>{ws.staff.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Starting stage</label><select name="stage" defaultValue={stage ?? 'to_brief'}>{STAGES.slice(0, 5).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></div>
        <div className="field"><label>Due date</label><input type="date" name="due_date" required defaultValue={todayIST()} /></div>
        <div className="field"><label>Posting time · IST</label><input type="time" name="posting_time" required defaultValue="19:00" /></div>
        <div className="field"><label>Priority</label><select name="priority"><option value="normal">Normal</option><option value="high">High priority</option></select></div>
        <div className="field full"><label>A little context</label><textarea name="brief" placeholder="The idea, the message, the must-haves..." /></div>
        {err && <div className="full err">{err}</div>}
      </form>
    </Modal>
  );
}
