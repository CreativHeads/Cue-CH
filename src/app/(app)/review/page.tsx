'use client';
import { ComingSoon } from '@/components/ComingSoon';

export default function Page() {
  return <ComingSoon eyebrow="A human touch goes a long way" title="Let’s connect the dots." sub="Review posts that need a little help finding their planned task." phase="Phase 2 (Instagram matching)"
    items={['Instagram posts pulled every 3 hours and matched to planned tasks', 'Suggested matches to confirm, choose another, mark extra or ignore', 'Unplanned posts flagged as extra (grey on the grid)', 'Deleted posts detected and tasks reverted with an alert']} />;
}
