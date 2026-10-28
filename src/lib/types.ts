export const CONTENT_TYPES = ['reel', 'carousel', 'poster', 'story', 'video', 'other'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
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
  reel: 'Reel', carousel: 'Carousel', poster: 'Poster', story: 'Story', video: 'Video', other: 'Other',
};
export const STAGE_LABEL: Record<Stage, string> = {
  to_brief: 'To brief', designing: 'Designing', client_review: 'Client review',
  approved: 'Approved', scheduled: 'Scheduled', posted: 'Posted',
};
/** "1 reel", "9 stories". */
export const typeCount = (n: number, t: ContentType) =>
  `${n} ${t === 'story' ? (n === 1 ? 'story' : 'stories') : TYPE_LABEL[t].toLowerCase() + (n === 1 ? '' : 's')}`;

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', lead: 'Creative lead', designer: 'Designer', editor: 'Editor' };

export interface Staff {
  id: string; name: string; email: string; role: Role; title: string | null;
  telegram_chat_id: number | null; digest_time: string; is_active: boolean;
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
