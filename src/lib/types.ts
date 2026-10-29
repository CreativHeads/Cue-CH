export const CONTENT_TYPES = ['reel', 'poster', 'special_days_poster', 'story', 'creative_reel', 'carousel', 'presentation_video', 'other'] as const;
export const ALL_CONTENT_TYPES = ['reel', 'poster', 'special_days_poster', 'story', 'creative_reel', 'carousel', 'presentation_video', 'video', 'other'] as const;
export type ContentType = (typeof ALL_CONTENT_TYPES)[number];
export const STAGES = ['to_brief', 'designing', 'client_review', 'approved', 'scheduled', 'posted'] as const;
export type Stage = (typeof STAGES)[number];
export type Role = 'admin' | 'lead' | 'designer' | 'editor';
export type PlanStatus = 'draft' | 'active' | 'closed';
export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type Frequency =
  | { mode: 'weekdays'; days: Weekday[] }
  | { mode: 'per_week'; count: number; days: Weekday[] }
  | { mode: 'spread' }
  | { mode: 'dates'; dates: string[] };

export const TYPE_LABEL: Record<ContentType, string> = {
  reel: 'Reel',
  poster: 'Poster',
  special_days_poster: 'Special Days Poster',
  story: 'Story',
  creative_reel: 'Creative Reel',
  carousel: 'Carousel',
  presentation_video: 'Presentation Video',
  video: 'Video',
  other: 'Other',
};

export interface ContentTypeColor {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

export const CONTENT_TYPE_COLORS: Record<ContentType, ContentTypeColor> = {
  reel: { bg: '#f3e8ff', border: '#c084fc', text: '#6b21a8', dot: '#9333ea' },
  poster: { bg: '#fee2e2', border: '#f87171', text: '#991b1b', dot: '#ef4444' },
  special_days_poster: { bg: '#ccfbf1', border: '#2dd4bf', text: '#0f766e', dot: '#0d9488' },
  story: { bg: '#dcfce7', border: '#4ade80', text: '#166534', dot: '#16a34a' },
  creative_reel: { bg: '#fdf2f8', border: '#f472b6', text: '#9d174d', dot: '#db2777' },
  carousel: { bg: '#dbeafe', border: '#60a5fa', text: '#1e40af', dot: '#2563eb' },
  presentation_video: { bg: '#fef9c3', border: '#facc15', text: '#854d0e', dot: '#ca8a04' },
  video: { bg: '#fef9c3', border: '#facc15', text: '#854d0e', dot: '#ca8a04' },
  other: { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', dot: '#64748b' },
};

export const STAGE_LABEL: Record<Stage, string> = {
  to_brief: 'To brief', designing: 'Designing', client_review: 'Client review',
  approved: 'Approved', scheduled: 'Scheduled', posted: 'Posted',
};
/** "1 reel", "9 stories". */
export const typeCount = (n: number, t: ContentType) =>
  `${n} ${t === 'story' ? (n === 1 ? 'story' : 'stories') : t === 'special_days_poster' ? (n === 1 ? 'special days poster' : 'special days posters') : (TYPE_LABEL[t] ?? t).toLowerCase() + (n === 1 ? '' : 's')}`;

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', lead: 'Creative lead', designer: 'Designer', editor: 'Editor' };

export interface Staff {
  id: string; name: string; email: string; role: Role; title: string | null;
  telegram_chat_id: string | null; digest_time: string; is_active: boolean;
}
export interface Client {
  id: string; name: string; ig_username: string; windsor_account_id: string | null; is_connected: boolean;
  account_manager_id: string | null; inactivity_days: number; count_collabs: boolean;
  brand_color: string | null; logo_path: string | null; status: 'active' | 'paused' | 'archived';
}
export interface Plan { id: string; client_id: string; month: string; status: PlanStatus; notes: string | null }
export interface PlanItem {
  id: string; plan_id: string; content_type: ContentType; monthly_count: number; frequency: Frequency;
  owner_id: string | null; posting_time: string; label: string | null; sort: number;
}
export interface Task {
  id: string; client_id: string; plan_item_id: string | null; seq: number | null; content_type: ContentType;
  due_at: string; owner_id: string | null; stage: Stage; title: string; brief: string | null;
  priority: 'normal' | 'high'; carried_over_from: string | null; posted_at: string | null; post_id: string | null;
  permalink: string | null; delivery: 'on_time' | 'late' | 'manual_unverified' | null; flags: string[];
  approved_at: string | null; scheduled_at: string | null; created_at: string;
}
export interface TaskEvent {
  id: string; task_id: string; actor_id: string | null; type: string; from_value: string | null; to_value: string | null; at: string;
}

/** Staff columns safe to send to the browser (never the password hash). */
export const STAFF_SELECT = 'id, name, email, role, title, telegram_chat_id, digest_time, is_active';
