'use client';
import { ComingSoon } from '@/components/ComingSoon';

export default function Page() {
  return <ComingSoon eyebrow="Good work deserves a good recap" title="The week, beautifully wrapped." sub="Clear delivery reports, ready for your next client conversation." phase="Phase 4 (weekly report and PDF)"
    items={['Monday carry-over of unposted tasks as high priority', 'Per-client report: planned vs posted, carried-over items, best post by reach', 'Client-ready one-page PDF, sent to the lead on Telegram', 'Month-end delivery scores (provisional on the 1st, final on the 8th)']} />;
}
