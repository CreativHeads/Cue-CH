import { Icon } from './Icon';
import { PageHead } from './ui';

export function ComingSoon({ eyebrow, title, sub, phase, items }: { eyebrow: string; title: string; sub: string; phase: string; items: string[] }) {
  return <>
    <PageHead eyebrow={eyebrow} title={title} sub={sub} />
    <div className="card card-pad">
      <div className="alert info"><Icon name="info" />Arrives in {phase}. The database tables are already in place.</div>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  </>;
}
