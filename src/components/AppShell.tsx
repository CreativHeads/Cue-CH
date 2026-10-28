'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon, Logo } from './Icon';
import { TaskDrawer } from './TaskDrawer';
import { NewTaskModal } from './NewTaskModal';
import { api, Avatar, Loading, Modal, toast, Toasts } from './ui';
import { ROLE_LABEL, type Client, type Stage, type Staff, type Task } from '@/lib/types';

interface Workspace {
  me: Staff; staff: Staff[]; clients: Client[]; isLead: boolean; isAdmin: boolean;
  staffById: (id: string | null) => Staff | undefined;
  clientById: (id: string) => Client | undefined;
  canEdit: (t: Pick<Task, 'owner_id'>) => boolean;
  openTask: (id: string) => void;
  newTask: (stage?: Stage, clientId?: string) => void;
  version: number; bump: () => void; reloadWorkspace: () => void;
}
const Ctx = createContext<Workspace | null>(null);
export const useWorkspace = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWorkspace outside AppShell');
  return c;
};

const NAV: ({ href: string; label: string; icon: string } | null)[] = [
  { href: '/', label: 'Overview', icon: 'overview' },
  { href: '/tasks', label: 'My tasks', icon: 'tasks' },
  { href: '/board', label: 'Content board', icon: 'board' },
  { href: '/clients', label: 'Clients', icon: 'clients' },
  { href: '/plans', label: 'Monthly plans', icon: 'calendar' },
  { href: '/review', label: 'Review queue', icon: 'review' },
  { href: '/reports', label: 'Reports', icon: 'reports' },
  null,
  { href: '/team', label: 'Team', icon: 'clients' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<{ me: Staff; staff: Staff[]; clients: Client[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<{ stage?: Stage; clientId?: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const load = useCallback(() => {
    api<{ me: Staff; staff: Staff[]; clients: Client[] }>('/api/me').then(setBoot).catch((e) => {
      // an expired or revoked session lands back on sign-in
      if (e.message === 'Not signed in') location.href = '/signin';
      else setError(e.message);
    });
  }, []);
  useEffect(load, [load]);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('task');
    if (t && boot) setTaskId(t);
  }, [boot, pathname]);

  const ws = useMemo<Workspace | null>(() => {
    if (!boot) return null;
    const isLead = boot.me.role === 'admin' || boot.me.role === 'lead';
    return {
      ...boot, isLead, isAdmin: boot.me.role === 'admin',
      staffById: (id) => boot.staff.find((s) => s.id === id),
      clientById: (id) => boot.clients.find((c) => c.id === id),
      canEdit: (t) => isLead || t.owner_id === boot.me.id,
      openTask: setTaskId,
      newTask: (stage, clientId) => setNewTask({ stage, clientId }),
      version, bump: () => setVersion((v) => v + 1), reloadWorkspace: load,
    };
  }, [boot, version, load]);

  if (error) {
    return (
      <div className="signin"><div className="card"><h1>Can’t open the workspace</h1><p className="muted">{error}</p>
        <form action="/api/auth/signout" method="post"><button className="btn" style={{ marginTop: 12 }}>Sign out</button></form></div></div>
    );
  }
  if (!ws) return <Loading />;

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const current = NAV.find((n) => n && active(n.href));

  return (
    <Ctx.Provider value={ws}>
      <div className="app">
        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <Link className="brand" href="/"><Logo /><span>CreativHeads<sup>®</sup></span></Link>
          <div className="ws-card"><span className="ws-ico"><Icon name="board" /></span><div><b>Content Tracker</b><small>Agency workspace</small></div></div>
          <div className="nav-label">Workspace</div>
          <nav className="nav">
            {NAV.map((n, i) => n ? (
              <Link key={n.href} href={n.href} className={active(n.href) ? 'on' : ''}><Icon name={n.icon} />{n.label}
                {n.href === '/team' && <span className="cnt">{ws.staff.filter((s) => s.is_active).length}</span>}
              </Link>
            ) : <div key={i} className="sep" />)}
          </nav>
          <div className="side-promo"><b><Icon name="spark" /> A smoother creative day</b><p>Your plans, people and progress.<br />All in one happy place.</p></div>
          <div className="side-user">
            <Avatar staff={ws.me} />
            <div style={{ flex: 1 }}><b>{ws.me.name}</b><small>{ws.me.role === 'admin' ? 'Workspace admin' : ROLE_LABEL[ws.me.role]}</small></div>
            <button className="icon-btn" title="Change password" onClick={() => setPwOpen(true)}><Icon name="settings" /></button>
            <form action="/api/auth/signout" method="post"><button className="icon-btn" title="Sign out"><Icon name="logout" /></button></form>
          </div>
        </aside>
        <div className="main-wrap">
          <header className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu"><Icon name="menu" /></button>
            <div className="crumbs">Workspace <span>›</span> <b>{current?.label ?? 'Overview'}</b></div>
            <form className="search" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q'); router.push(`/board?q=${encodeURIComponent(String(q || ''))}`); }}>
              <Icon name="search" /><input name="q" placeholder="Search tasks..." autoComplete="off" />
            </form>
            <Avatar staff={ws.me} />
          </header>
          <main className="main">{children}</main>
        </div>
      </div>
      {taskId && <TaskDrawer id={taskId} onClose={() => setTaskId(null)} onChange={ws.bump} />}
      {newTask && <NewTaskModal {...newTask} onClose={() => setNewTask(null)} onCreated={ws.bump} />}
      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
      <Toasts />
    </Ctx.Provider>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setErr(null);
    try { await api('/api/auth/password', { method: 'POST', json: { current, next } }); toast('Password changed'); onClose(); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title="Change your password" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Change password</button></>}>
      <form className="fgrid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="field full"><label>Current password</label><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        <div className="field full"><label>New password (at least 8 characters)</label><input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        {err && <div className="full err">{err}</div>}
      </form>
    </Modal>
  );
}
