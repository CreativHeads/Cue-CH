'use client';
import { ComingSoon } from '@/components/ComingSoon';

export default function Page() {
  return <ComingSoon eyebrow="A workspace that works for you" title="Make yourself at home." sub="Choose how your team stays in the loop." phase="Phase 3 (reminders)"
    items={['Telegram linking for each teammate', 'Morning digest, 2-hour nudge, overdue alerts and inactivity red flags', 'Quiet hours and the copy guard banned-terms list', 'Job health for every scheduled run']} />;
}
