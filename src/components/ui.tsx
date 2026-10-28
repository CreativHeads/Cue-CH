'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { STAGE_LABEL, type Client, type ContentType, type Stage, type Staff } from '@/lib/types';

/** JSON fetch that throws the API's error message. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/** Fetch on mount and whenever deps change; `reload` refetches. */
export function useData<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    api<T>(url).then((d) => live && (setData(d), setError(null))).catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload, setData };
}

export const TypeIcon = ({ type }: { type: ContentType }) => <span className={`type-ic ${type}`}><Icon name={type} size={15} /></span>;
export const StageBadge = ({ stage }: { stage: Stage }) => <span className={`badge st-${stage}`}>{STAGE_LABEL[stage]}</span>;

const COLORS = ['#e8ecd9', '#e3ecf3', '#ebe7f5', '#f5e9e1', '#e3f0e6', '#f6e6e6'];
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export function Avatar({ staff, sm }: { staff?: Staff | null; sm?: boolean }) {
  const name = staff?.name ?? '?';
  const color = COLORS[(name.charCodeAt(0) + name.length) % COLORS.length];
  return <span className={`av ${sm ? 'sm' : ''}`} style={{ ['--c' as string]: color }} title={name}>{staff ? name.slice(0, 2).toUpperCase() : '?'}</span>;
}
export function ClientLogo({ client }: { client: Client }) {
  const words = client.name.split(/\s+/);
  const ini = (words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 3) : client.name.slice(0, 2)).toLowerCase();
  return <span className="logo" style={{ ['--c' as string]: client.brand_color || '#e8efe3' }}>{ini}</span>;
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: ReactNode; title: ReactNode; sub: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{sub}</p></div>
      <div className="head-actions">{actions}</div>
    </div>
  );
}

export function Select({ value, onChange, options, icon, disabled }: {
  value: string; onChange: (v: string) => void; options: [string, string][]; icon?: string; disabled?: boolean;
}) {
  return (
    <label className="sel">
      {icon && <Icon name={icon} size={14} />}
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="overlay open" onClick={onClose} />
      <div className="modal open">
        <div className={`modal-box ${wide ? 'wide' : ''}`}>
          <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      </div>
    </>
  );
}

let pushToast: (msg: string) => void = () => {};
export const toast = (msg: string) => pushToast(msg);
export function Toasts() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    pushToast = (msg) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, msg }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
    };
  }, []);
  return <div className="toasts">{items.map((i) => <div key={i.id} className="toast">{i.msg}</div>)}</div>;
}

export const Loading = () => <div className="loading">Loading…</div>;
export const ErrorBox = ({ error }: { error: string }) => <div className="alert red">{error}</div>;
