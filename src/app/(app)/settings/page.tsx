'use client';
import { useEffect, useState } from 'react';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { api, Loading, PageHead, toast, useData } from '@/components/ui';
import { bannedTermsIn } from '@/lib/copyGuard';

interface Settings {
  digest_enabled: boolean; nudge_enabled: boolean; overdue_enabled: boolean; inactivity_enabled: boolean; quiet_hours_enabled: boolean;
  quiet_start: string; quiet_end: string; digest_time: string; banned_terms: string[]; default_banned: string[]; telegram_bot: string | null;
  team_group_chat_id: string | null; digest_target: 'personal' | 'group' | 'both'; task_cards_enabled: boolean;
}
interface Health {
  jobs: { job: string; label: string; last: { started_at: string; status: string | null; error: string | null; stats: Record<string, unknown> | null } | null; lastSuccess: string | null; stale: boolean }[];
  config: { instagram: boolean; telegram: boolean; telegramWebhook: boolean; scheduler: boolean };
}
interface Outbox { id: string; kind: string; text: string; sent_at: string | null; error: string | null; created_at: string; staff_name: string | null }

const when = (t: string) => new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export default function SettingsPage() {
  const ws = useWorkspace();
  const settings = useData<Settings>('/api/settings', [ws.version]);
  const health = useData<Health>('/api/health', [ws.version]);
  const outbox = useData<Outbox[]>('/api/notifications', [ws.version]);
  const [s, setS] = useState<Settings | null>(null);
  const [term, setTerm] = useState('');
  const [test, setTest] = useState('');
  const [group, setGroup] = useState('');
  useEffect(() => { if (settings.data) { setS(settings.data); setGroup(settings.data.team_group_chat_id ?? ''); } }, [settings.data]);
  const admin = ws.isAdmin;

  async function save(patch: Partial<Settings>) {
    if (!s) return;
    setS({ ...s, ...patch });
    try { await api('/api/settings', { method: 'PATCH', json: patch }); toast('Saved'); } catch (e) { toast((e as Error).message); settings.reload(); }
  }
  async function testGroup() {
    try { await api('/api/settings/telegram-test', { method: 'POST', json: { chat_id: group.trim() } }); toast('Test message sent. Check the group.'); }
    catch (e) { toast((e as Error).message); }
  }
  async function connectTelegram() {
    try { const r = await api<{ url: string }>('/api/telegram/link-code', { method: 'POST' }); window.open(r.url, '_blank', 'noopener'); toast('Press Start in Telegram to finish'); }
    catch (e) { toast((e as Error).message); }
  }

  const toggle = (k: keyof Settings, title: string, sub: string) => (
    <div className="toggle-row"><div><b>{title}</b><small>{sub}</small></div>
      <label className="switch"><input type="checkbox" checked={!!s?.[k]} disabled={!admin} onChange={(e) => save({ [k]: e.target.checked })} /><span /></label></div>
  );
  const h = health.data;
  const guardHits = test ? bannedTermsIn(test, s?.banned_terms ?? []) : [];

  return <>
    <PageHead eyebrow="A workspace that works for you" title="Make yourself at home." sub="Choose how your team stays in the loop." />
    {!s || !h ? <Loading /> : <>
      {!admin && <div className="info-bar"><Icon name="info" size={15} />Only the admin can change these settings.</div>}
      <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="card card-pad"><h3>A thoughtful reminder rhythm</h3><div className="sub">The right nudge, at the right time.</div>
            <div style={{ marginTop: 10 }}>
              {toggle('digest_enabled', 'Morning digest', 'Today, overdue and waiting-on-client, each morning.')}
              {toggle('task_cards_enabled', 'Task cards', 'Each designer gets their task on its day, with buttons to move it along.')}
              {toggle('nudge_enabled', 'Before-it’s-due nudge', 'Two hours before unapproved content is due.')}
              {toggle('overdue_enabled', 'Overdue alerts', 'To the owner and the creative lead, once a day per task.')}
              {toggle('inactivity_enabled', 'Inactivity red flags', 'When a client goes quiet while the plan expected posts.')}
              {toggle('quiet_hours_enabled', 'Quiet hours', 'Hold non-urgent messages until the morning.')}
            </div>
            <div className="fgrid" style={{ marginTop: 12 }}>
              <div className="field"><label>Daily digest · IST</label><input type="time" value={s.digest_time.slice(0, 5)} disabled={!admin} onChange={(e) => e.target.value && save({ digest_time: e.target.value })} /></div>
              <div className="field" />
              <div className="field"><label>Quiet hours start · IST</label><input type="time" value={s.quiet_start.slice(0, 5)} disabled={!admin} onChange={(e) => e.target.value && save({ quiet_start: e.target.value })} /></div>
              <div className="field"><label>Quiet hours end · IST</label><input type="time" value={s.quiet_end.slice(0, 5)} disabled={!admin} onChange={(e) => e.target.value && save({ quiet_end: e.target.value })} /></div>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginBottom: 0 }}>The digest is sent by the scheduler at 7:00 AM IST; change the scheduler to move it.</p>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}><h3>Copy guard</h3><div className="sub">These words are never sent in Telegram messages or client reports (whole word, any case).</div>
            <div className="terms">{s.default_banned.map((t) => <span key={t} style={{ opacity: 0.75 }}>{t}</span>)}
              {s.banned_terms.map((t) => <span key={t}>{t}{admin && <button onClick={() => save({ banned_terms: s.banned_terms.filter((x) => x !== t) })}>×</button>}</span>)}</div>
            {admin && <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); const v = term.trim().toLowerCase(); if (v.length >= 2 && !s.banned_terms.includes(v)) save({ banned_terms: [...s.banned_terms, v] }); setTerm(''); }}>
              <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Add a word, e.g. a tool name" /><button className="btn sm">Add</button></form>}
            <div className="field" style={{ marginTop: 12 }}><label>Test a message</label><input className="input" value={test} onChange={(e) => setTest(e.target.value)} placeholder="Type a message to check…" /></div>
            {test && <div style={{ fontSize: 12, marginTop: 6 }} className={guardHits.length ? 'overdue-txt' : 'band-g'}>{guardHits.length ? `Blocked: ${guardHits.join(', ')}` : 'Safe to send.'}</div>}
          </div>
        </div>

        <div>
          <div className="card card-pad"><h3>Keep the team connected</h3><div className="sub">Where reminders arrive.</div>
            <div className="conn" style={{ marginTop: 10 }}><span className="ic" style={{ background: '#eef4fb', color: '#3b6ea5' }}><Icon name="arrow" /></span>
              <div><b>Telegram {h.config.telegram ? '' : '(not set up on the server yet)'}</b>
                <small>{ws.staff.filter((x) => x.telegram_chat_id).length} of {ws.staff.filter((x) => x.is_active).length} teammates linked · you: {ws.me.telegram_chat_id ? 'linked' : 'not linked'}</small></div>
              {h.config.telegramWebhook && s.telegram_bot ? <button className="btn sm" onClick={connectTelegram}>Connect Telegram</button> : null}</div>
            {!h.config.telegramWebhook && <p className="muted" style={{ fontSize: 11.5 }}>Send-only mode: the admin adds each person’s Telegram chat ID on the Team screen. Self-linking and tap-to-approve buttons turn on when the tracker has its own bot.</p>}
            <div className="group-box">
              <b>Team group</b>
              <small>Post everyone’s tasks for the day to one Telegram group each morning. Add the bot{s.telegram_bot ? ` (@${s.telegram_bot})` : ''} to the group first, then paste the group’s chat ID. It starts with -100.</small>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <input className="input" value={group} disabled={!admin} onChange={(e) => setGroup(e.target.value)} placeholder="-1001234567890" />
                {admin && <button className="btn sm" disabled={!group.trim()} onClick={testGroup}>Send test</button>}
                {admin && <button className="btn sm primary" disabled={group.trim() === (s.team_group_chat_id ?? '')} onClick={() => save({ team_group_chat_id: group.trim() || null })}>Save</button>}
              </div>
              <div className="field" style={{ marginTop: 10 }}><label>Morning digest goes to</label>
                <select value={s.digest_target} disabled={!admin} onChange={(e) => save({ digest_target: e.target.value as Settings['digest_target'] })}>
                  <option value="personal">Each person’s own chat</option>
                  <option value="group" disabled={!s.team_group_chat_id}>The team group only</option>
                  <option value="both" disabled={!s.team_group_chat_id}>Both</option>
                </select></div>
            </div>
            <div className="conn"><span className="ic" style={{ background: '#fbeef4', color: '#b4588a' }}><Icon name="insta" /></span>
              <div><b>Instagram data {h.config.instagram ? '' : '(not set up on the server yet)'}</b><small>{ws.clients.filter((c) => c.is_connected).length} client accounts marked connected</small></div></div>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}><h3>Job health</h3><div className="sub">Background work and when it last succeeded.</div>
            <table className="ttable health" style={{ marginTop: 8 }}><tbody>{h.jobs.map((j) => (
              <tr key={j.job}><td><b>{j.label}</b><br /><small className="muted">{j.last?.error ? j.last.error.slice(0, 90) : j.lastSuccess ? `Last success ${when(j.lastSuccess)}` : 'Not run yet'}</small></td>
                <td style={{ textAlign: 'right' }}><span className={`badge ${!j.last ? 'grey' : j.last.status === 'failed' ? 'red' : j.stale ? 'amber' : 'green'}`}>{!j.last ? 'Waiting' : j.last.status === 'failed' ? 'Failed' : j.stale ? 'Stale' : j.last.status === 'partial' ? 'Partial' : 'OK'}</span></td></tr>
            ))}</tbody></table>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}><h3>Telegram outbox</h3><div className="sub">Latest messages sent, held back or blocked.</div>
            {(outbox.data ?? []).slice(0, 12).map((n) => <div className="ev" key={n.id}><i style={{ background: n.error ? 'var(--red)' : '#9cc46d' }} />
              <div>{plain(n.text ?? n.kind).slice(0, 160)}<small>{n.staff_name ?? '—'} · {n.error ?? 'Sent'} · {when(n.created_at)}</small></div></div>)}
            {!outbox.data?.length && <p className="muted" style={{ fontSize: 12 }}>Nothing sent yet.</p>}
          </div>
        </div>
      </div>
    </>}
  </>;
}
