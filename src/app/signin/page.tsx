'use client';
import { useState } from 'react';
import { Logo } from '@/components/Icon';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Could not sign in'); setBusy(false); return; }
    location.href = '/';
  }

  return (
    <div className="signin"><div className="card">
      <div className="brand" style={{ padding: 0 }}><Logo /><span>CreativHeads<sup>®</sup></span></div>
      <h1>Welcome back.</h1>
      <p className="muted" style={{ marginTop: 0 }}>Sign in to the Content Tracker.</p>
      <form onSubmit={submit}>
        <div className="field"><label>Email</label><input type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@creativheads.in" /></div>
        <div className="field" style={{ marginTop: 12 }}><label>Password</label><input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn primary full-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      {error && <div className="err">{error}</div>}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Forgot your password? Ask Souban to reset it from the Team screen.</p>
    </div></div>
  );
}
