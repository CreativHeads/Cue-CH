'use client';
import { useState } from 'react';
import { useWorkspace } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { ErrorBox, Loading, PageHead, Select, useData } from '@/components/ui';
import { fmtYM, todayIST, ymAdd, ymOf } from '@/lib/dates';
import { band, bandLabel } from '@/lib/score';

interface Score { client_id: string; client_name: string; month: string; planned: number; on_time: number; late: number; missed: number; extra: number; score: string | null; is_final: boolean }
const BAND: Record<string, string> = { green: 'band-g', amber: 'band-a', red: 'band-r', none: '' };

export default function Reports() {
  const ws = useWorkspace();
  const months = Array.from({ length: 6 }, (_, i) => ymAdd(ymOf(todayIST()), -(i + 1)));
  const [month, setMonth] = useState(months[0]);
  const { data, error } = useData<Score[]>(`/api/scores?month=${month}`, [ws.version]);
  const day = +todayIST().slice(8);

  return <>
    <PageHead eyebrow="Good work deserves a good recap" title="The month, scored." sub="Month-end delivery scores: provisional on the 1st, final on the 8th once late posts are counted." />
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
      <Select icon="calendar" value={month} onChange={setMonth} options={months.map((m) => [m, fmtYM(m)] as [string, string])} />
      <span className="muted" style={{ fontSize: 12 }}>Score = (on time + ½ late + ¾ marked by hand) ÷ planned. Extras are shown but don’t raise it.</span>
    </div>
    {error && <ErrorBox error={error} />}
    {!data ? <Loading /> : !data.length ? (
      <div className="card empty">No scores for {fmtYM(month)} yet. {month === months[0] && day < 8 ? 'The provisional score appears on the 1st and the final one on the 8th.' : 'Scores are worked out on the 1st and the 8th of the following month.'}</div>
    ) : (
      <div className="card"><table className="ttable"><thead><tr><th>Client</th><th>Planned</th><th className="hide-m">On time</th><th className="hide-m">Late</th><th>Missed</th><th className="hide-m">Extra</th><th>Score</th></tr></thead>
        <tbody>{data.map((s) => { const sc = s.score == null ? null : Number(s.score); return (
          <tr key={s.client_id}><td><b>{s.client_name}</b><br /><small className="muted">{s.is_final ? 'Final' : 'Provisional'}</small></td>
            <td>{s.planned}</td><td className="hide-m">{s.on_time}</td><td className="hide-m">{s.late}</td><td>{s.missed}</td><td className="hide-m">{s.extra}</td>
            <td className={BAND[band(sc)]}><b>{sc == null ? '—' : sc.toFixed(1)}</b> <small>{bandLabel(sc)}</small></td></tr>); })}</tbody></table></div>
    )}
    <div className="info-bar" style={{ marginTop: 18 }}><Icon name="info" size={15} />Weekly client reports with a PDF arrive in Phase 4.</div>
  </>;
}
