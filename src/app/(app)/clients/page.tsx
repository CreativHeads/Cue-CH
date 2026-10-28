'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useWorkspace } from '@/components/AppShell';
import { ClientModal } from '@/components/ClientModal';
import { Icon } from '@/components/Icon';
import { ClientLogo, ErrorBox, Loading, PageHead, useData } from '@/components/ui';
import { fmtD, MONTHS, todayIST, ymOf } from '@/lib/dates';
import { band } from '@/lib/score';
import type { Client } from '@/lib/types';

interface Row { client: Client; score: number | null; lastPost: string | null; inactive: unknown; cells: Record<string, { tasks: { stage: string }[] }> }

export default function Clients() {
  const ws = useWorkspace();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const month = ymOf(todayIST());
  const { data, error } = useData<{ rows: Row[] }>(`/api/dashboard?month=${month}`, [ws.version]);
  const rows = (data?.rows ?? []).filter((r) => `${r.client.name} ${r.client.ig_username}`.toLowerCase().includes(q.toLowerCase()));

  return <>
    <PageHead eyebrow="Good relationships, great content" title="Your clients, together." sub="A clear picture of every brand you take care of."
      actions={ws.isAdmin && <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />Add client</button>} />
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
      <span className="muted" style={{ fontSize: 12.5 }}>Showing {rows.length} of {data?.rows.length ?? 0} clients</span>
      <label className="search-in"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a client..." /></label>
    </div>
    {error && <ErrorBox error={error} />}
    {!data ? <Loading /> : <div className="cgrid">{rows.map((r) => {
      const all = Object.values(r.cells).flatMap((c) => c.tasks);
      const posted = all.filter((t) => t.stage === 'posted').length;
      const c = r.client;
      const status = c.status === 'paused' ? <span className="badge grey nodot">Paused</span> : r.inactive ? <span className="badge red nodot">Needs attention</span>
        : c.is_connected ? <span className="badge green nodot">Connected</span> : <span className="badge amber nodot">Not connected</span>;
      return <div key={c.id} className="card ccard">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}><ClientLogo client={c} />{status}</div>
        <h3>{c.name}</h3><small>@{c.ig_username}</small>
        <div className="cstats"><div><small>Planned</small><b>{all.length}</b></div><div><small>Posted</small><b>{posted}</b></div>
          <div><small>Delivery score</small><b className={{ green: 'band-g', amber: 'band-a', red: 'band-r', none: '' }[band(r.score)]}>{r.score == null ? '—' : Math.round(r.score)}<small>%</small></b></div></div>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}><span>{MONTHS[+month.slice(5) - 1]} delivery</span><span className="muted">{posted} of {all.length}</span></div>
        <div className="progress"><i style={{ width: `${all.length ? (posted / all.length) * 100 : 0}%` }} /></div>
        <div style={{ fontSize: 11.5 }} className="muted">Last post · {r.lastPost ? fmtD(r.lastPost) : 'none yet'}</div>
        <Link className="btn full-btn" href={`/clients/${c.id}`}>Open workspace →</Link>
      </div>;
    })}</div>}
    {adding && <ClientModal onClose={() => setAdding(false)} />}
  </>;
}
