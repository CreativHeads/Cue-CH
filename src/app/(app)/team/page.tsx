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
  const [deleting, setDeleting] = useState<Staff | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resetting, setResetting] = useState<Staff | null>(null);
  const [tg, setTg] = useState<Staff | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);
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
  async function remove(s: Staff, reassign_to?: string) {
    try { await api(`/api/staff/${s.id}${reassign_to ? `?reassign_to=${reassign_to}` : ''}`, { method: 'DELETE' }); toast(`${s.name} deleted`); setDeleting(null); ws.reloadWorkspace(); ws.bump(); }
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
            <Link href={`/tasks?owner=${s.id}`} className="t"><b>{s.name}{s.id === ws.me.id && <small> (you)</small>}</b><small>{s.title ?? ROLE_LABEL[s.role]} · {s.email}{!s.telegram_chat_id && ' · no Telegram'}{!s.is_active && ' · Inactive'}</small></Link>
            {od > 0 && <span className="badge red nodot">{od} overdue</span>}
            <span className="badge nodot grey">{open.length} open</span>
            {ws.isAdmin && <button className="btn sm" onClick={() => setEditing(s)}>Edit</button>}
            {ws.isAdmin && <button className="btn sm" onClick={() => setTg(s)}>{s.telegram_chat_id ? 'Telegram ✓' : 'Telegram'}</button>}
            {ws.isAdmin && s.id !== ws.me.id && <button className="btn sm" onClick={() => setResetting(s)}>Reset password</button>}
            {ws.isAdmin && s.id !== ws.me.id && <button className="btn sm" onClick={() => (s.is_active ? setDeactivating(s) : setActive(s, true))}>{s.is_active ? 'Deactivate' : 'Activate'}</button>}
            {ws.isAdmin && s.id !== ws.me.id && <button className="btn sm danger" onClick={() => setDeleting(s)}>Delete</button>}
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
    {tg && <TelegramModal staff={tg} onClose={() => setTg(null)} />}
    {editing && <EditModal staff={editing} onClose={() => setEditing(null)} />}
    {deactivating && <DeactivateModal staff={deactivating} openCount={(data ?? []).filter((t) => t.owner_id === deactivating.id).length} onClose={() => setDeactivating(null)} onConfirm={(to) => setActive(deactivating, false, to)} />}
    {deleting && <DeleteModal staff={deleting} openCount={(data ?? []).filter((t) => t.owner_id === deleting.id).length} onClose={() => setDeleting(null)} onConfirm={(to) => remove(deleting, to)} />}
  </>;
}

function DeleteModal({ staff, openCount, onClose, onConfirm }: { staff: Staff; openCount: number; onClose: () => void; onConfirm: (to?: string) => void }) {
  const ws = useWorkspace();
  const [to, setTo] = useState('');
  const [typed, setTyped] = useState('');
  const ok = typed.trim().toLowerCase() === staff.name.trim().toLowerCase();
  return <Modal title={`Delete ${staff.name}?`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} disabled={!ok} onClick={() => onConfirm(to || undefined)}>Delete for good</button></>}>
    <p style={{ marginTop: 0 }}>This can’t be undone. Their account is removed, and their name disappears from past tasks, history and reports. To keep their history, use <b>Deactivate</b> instead.</p>
    {openCount > 0 && <div className="field"><label>{openCount} open task{openCount === 1 ? '' : 's'}: reassign to</label><select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Leave unassigned</option>{ws.staff.filter((s) => s.is_active && s.id !== staff.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
    <div className="field" style={{ marginTop: 10 }}><label>Type <b>{staff.name}</b> to confirm</label><input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></div>
  </Modal>;
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

function TelegramModal({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const ws = useWorkspace();
  const [chat, setChat] = useState(staff.telegram_chat_id ?? '');
  const [err, setErr] = useState<string | null>(null);
  async function save(value: string | null) {
    setErr(null);
    try { await api(`/api/staff/${staff.id}`, { method: 'PATCH', json: { telegram_chat_id: value } }); toast(value ? 'Telegram linked' : 'Telegram unlinked'); ws.reloadWorkspace(); onClose(); }
    catch (e) { setErr((e as Error).message); }
  }
  return <Modal title={`${staff.name} on Telegram`} onClose={onClose} footer={<>
    {staff.telegram_chat_id && <button className="btn danger" onClick={() => save(null)}>Unlink</button>}
    <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save(chat.trim() || null)}>Save</button></>}>
    <div className="field"><label>Telegram chat ID</label><input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="e.g. 123456789" inputMode="numeric" /></div>
    <p className="muted" style={{ fontSize: 12 }}>To find it, {staff.name} sends any message to the reminder bot, then you read the chat ID from the bot’s updates (or use @userinfobot). They must have pressed Start on the bot, or Telegram won’t deliver.</p>
    {err && <div className="err">{err}</div>}
  </Modal>;
}

function EditModal({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const ws = useWorkspace();
  const [err, setErr] = useState<string | null>(null);
  const self = staff.id === ws.me.id;
  async function save() {
    const form = document.getElementById('edForm') as HTMLFormElement;
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try {
      await api(`/api/staff/${staff.id}`, { method: 'PATCH', json: { name: d.name, email: d.email, title: d.title || null, ...(self ? {} : { role: d.role }) } });
      toast('Saved'); ws.reloadWorkspace(); onClose();
    } catch (e) { setErr((e as Error).message); }
  }
  return <Modal title={`Edit ${staff.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
    <form id="edForm" className="fgrid" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="field"><label>Name</label><input name="name" required defaultValue={staff.name} /></div>
      <div className="field"><label>Sign-in email</label><input name="email" type="email" required defaultValue={staff.email} /></div>
      <div className="field"><label>Role</label><select name="role" defaultValue={staff.role} disabled={self}><option value="designer">Designer</option><option value="editor">Editor</option><option value="lead">Lead</option><option value="admin">Admin</option></select></div>
      <div className="field"><label>Title</label><input name="title" defaultValue={staff.title ?? ''} /></div>
      {err && <div className="full err">{err}</div>}
    </form>
  </Modal>;
}
