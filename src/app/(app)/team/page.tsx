'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { api, Avatar, Modal, PageHead, toast, useData } from '@/components/ui';
import { ROLE_LABEL, type Staff, type Task } from '@/lib/types';

export default function Team() {
  const ws = useWorkspace();
  const { data } = useData<Task[]>('/api/tasks?open=true', [ws.version]);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<Staff | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resetting, setResetting] = useState<Staff | null>(null);
  const now = new Date();

  async function addStaff() {
    const form = document.getElementById('stForm') as HTMLFormElement;
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try { await api('/api/staff', { method: 'POST', json: { name: d.name, email: d.email, role: d.role, title: d.title || null, password: d.password } }); toast('Teammate added. Share their email and starting password with them.'); setAdding(false); ws.reloadWorkspace(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function setActive(s: Staff, is_active: boolean, reassign_to?: string) {
    try { await api(`/api/staff/${s.id}`, { method: 'PATCH', json: { is_active, ...(reassign_to ? { reassign_to } : {}) } }); toast(is_active ? `${s.name} reactivated` : `${s.name} deactivated`); setDeactivating(null); ws.reloadWorkspace(); ws.bump(); }
    catch (e) { toast((e as Error).message); }
  }

  return <>
    <PageHead eyebrow="Good work is a team thing" title="The people behind the posts." sub="A clear view of ownership, workload and roles."
      actions={ws.isAdmin && <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />Add teammate</button>} />
    <div className="grid2">
      <div className="card"><div className="card-pad"><h3>Your creative team</h3><div className="sub">{ws.staff.length} teammates</div></div>
        {ws.staff.map((s) => {
          const open = (data ?? []).filter((t) => t.owner_id === s.id);
          const od = open.filter((t) => new Date(t.due_at) < now).length;
          return <div key={s.id} className="list-item" style={{ opacity: s.is_active ? 1 : 0.55 }}>
            <Avatar staff={s} />
            <Link href={`/tasks?owner=${s.id}`} className="t"><b>{s.name}{s.id === ws.me.id && <small> (you)</small>}</b><small>{s.title ?? ROLE_LABEL[s.role]} · {s.email}{!s.is_active && ' · Inactive'}</small></Link>
            {od > 0 && <span className="badge red nodot">{od} overdue</span>}
            <span className="badge nodot grey">{open.length} open</span>
            {ws.isAdmin && s.id !== ws.me.id && <button className="btn sm" onClick={() => setResetting(s)}>Reset password</button>}
            {ws.isAdmin && s.id !== ws.me.id && <button className="btn sm" onClick={() => (s.is_active ? setDeactivating(s) : setActive(s, true))}>{s.is_active ? 'Deactivate' : 'Activate'}</button>}
          </div>;
        })}
      </div>
      <div><div className="card"><div className="card-pad"><h3>Clear roles. Easier collaboration.</h3><div className="sub">Checked by the server on every request, not just hidden on screen.</div></div>
        {[['Admin', 'Everything: clients, connections, staff, settings, plans and reports.'], ['Creative lead', 'Plans, task assignment, approvals, review queue and reports.'], ['Designer & editor', 'Own tasks: move stages, add notes and links, mark posted manually.']].map(([a, b]) => <div key={a} className="attn"><div><b>{a}</b><p>{b}</p></div></div>)}
      </div></div>
    </div>
    {adding && <Modal title="Add a teammate" onClose={() => setAdding(false)} footer={<><button className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" onClick={addStaff}>Add teammate</button></>}>
      <form id="stForm" className="fgrid" onSubmit={(e) => { e.preventDefault(); addStaff(); }}>
        <div className="field"><label>Name</label><input name="name" required /></div>
        <div className="field"><label>Sign-in email</label><input name="email" type="email" required /></div>
        <div className="field"><label>Role</label><select name="role"><option value="designer">Designer</option><option value="editor">Editor</option><option value="lead">Lead</option><option value="admin">Admin</option></select></div>
        <div className="field"><label>Title</label><input name="title" placeholder="e.g. Visual designer" /></div>
        <div className="field full"><label>Starting password (at least 8 characters; they can change it later)</label><input name="password" type="text" required minLength={8} autoComplete="off" /></div>
        {err && <div className="full err">{err}</div>}
      </form></Modal>}
    {resetting && <ResetModal staff={resetting} onClose={() => setResetting(null)} />}
    {deactivating && <DeactivateModal staff={deactivating} openCount={(data ?? []).filter((t) => t.owner_id === deactivating.id).length} onClose={() => setDeactivating(null)} onConfirm={(to) => setActive(deactivating, false, to)} />}
  </>;
}

function DeactivateModal({ staff, openCount, onClose, onConfirm }: { staff: Staff; openCount: number; onClose: () => void; onConfirm: (to?: string) => void }) {
  const ws = useWorkspace();
  const [to, setTo] = useState('');
  return <Modal title={`Deactivate ${staff.name}?`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onConfirm(to || undefined)}>Deactivate</button></>}>
    <p style={{ marginTop: 0 }}>{openCount} open task{openCount === 1 ? '' : 's'} need a new owner. They lose access immediately.</p>
    <div className="field"><label>Reassign all open tasks to</label><select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Keep for now</option>{ws.staff.filter((s) => s.is_active && s.id !== staff.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
  </Modal>;
}

function ResetModal({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setErr(null);
    try { await api(`/api/staff/${staff.id}`, { method: 'PATCH', json: { password: pw } }); toast(`New password set for ${staff.name}. They’ve been signed out everywhere.`); onClose(); }
    catch (e) { setErr((e as Error).message); }
  }
  return <Modal title={`Reset ${staff.name}’s password`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Set password</button></>}>
    <div className="field"><label>New password (at least 8 characters)</label><input type="text" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
    <p className="muted" style={{ fontSize: 12 }}>Share it with {staff.name} directly. They can change it after signing in.</p>
    {err && <div className="err">{err}</div>}
  </Modal>;
}
