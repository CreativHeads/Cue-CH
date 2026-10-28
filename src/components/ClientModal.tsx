'use client';
import { useState } from 'react';
import { useWorkspace } from './AppShell';
import { api, Modal, toast } from './ui';
import type { Client } from '@/lib/types';

export function ClientModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const ws = useWorkspace();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const form = document.getElementById('clForm') as HTMLFormElement;
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const payload = {
      name: d.name, ig_username: d.ig_username, brand_color: d.brand_color, inactivity_days: Number(d.inactivity_days) || 3,
      account_manager_id: d.account_manager_id || null, status: d.status, is_connected: d.is_connected === '1',
      windsor_account_id: d.windsor_account_id || null, count_collabs: d.count_collabs === 'on',
    };
    setBusy(true); setErr(null);
    try {
      await api(client ? `/api/clients/${client.id}` : '/api/clients', { method: client ? 'PATCH' : 'POST', json: payload });
      toast(client ? 'Client saved' : 'Client added. Create their monthly plan next.');
      ws.reloadWorkspace(); ws.bump(); onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const c = client;
  return (
    <Modal title={c ? 'Edit client' : 'A new brand to care for.'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={submit}>{c ? 'Save client' : 'Add client'}</button></>}>
      <form id="clForm" className="fgrid" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="field full"><label>Client name</label><input name="name" required defaultValue={c?.name} placeholder="e.g. Elite Dental Studio" /></div>
        <div className="field"><label>Instagram handle</label><input name="ig_username" required defaultValue={c?.ig_username} placeholder="without @" /></div>
        <div className="field"><label>Brand colour</label><input name="brand_color" type="color" defaultValue={c?.brand_color ?? '#e4efe7'} style={{ height: 36, padding: 3 }} /></div>
        <div className="field"><label>Inactivity flag after (days)</label><input name="inactivity_days" type="number" min={1} max={30} defaultValue={c?.inactivity_days ?? 3} /></div>
        <div className="field"><label>Account manager</label><select name="account_manager_id" defaultValue={c?.account_manager_id ?? ''}><option value="">None</option>{ws.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Status</label><select name="status" defaultValue={c?.status ?? 'active'}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></div>
        <div className="field"><label>Instagram data</label><select name="is_connected" defaultValue={c?.is_connected ? '1' : '0'}><option value="1">Connected</option><option value="0">Not connected</option></select></div>
        <div className="field full"><label>Data account ID (for Instagram matching, Phase 2)</label><input name="windsor_account_id" defaultValue={c?.windsor_account_id ?? ''} /></div>
        <div className="field full"><label className="row" style={{ gap: 8 }}><input type="checkbox" name="count_collabs" defaultChecked={c?.count_collabs ?? true} style={{ width: 'auto' }} /> Count collab posts toward the plan</label></div>
        {err && <div className="full err">{err}</div>}
      </form>
    </Modal>
  );
}
