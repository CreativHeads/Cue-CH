import { z } from 'zod';
import { ALL_CONTENT_TYPES, CONTENT_TYPES, STAGES } from './types';

const weekday = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const month = z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-MM');
export const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:MM');
export const uuid = z.string().uuid();
export const password = z.string().min(8, 'at least 8 characters').max(200);

export const frequency = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('weekdays'), days: z.array(weekday) }),
  z.object({ mode: z.literal('per_week'), count: z.number().int().min(0).max(7), days: z.array(weekday) }),
  z.object({ mode: z.literal('spread') }),
  z.object({ mode: z.literal('dates'), dates: z.array(date) }),
]);

export const clientInput = z.object({
  name: z.string().trim().min(1),
  ig_username: z.string().trim().min(1).transform((s) => s.replace(/^@/, '')),
  is_connected: z.boolean().optional(),
  windsor_account_id: z.string().nullable().optional(),
  account_manager_id: uuid.nullable().optional(),
  inactivity_days: z.number().int().min(1).max(30).optional(),
  count_collabs: z.boolean().optional(),
  brand_color: z.string().nullable().optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
});
export const CLIENT_COLS = ['name', 'ig_username', 'is_connected', 'windsor_account_id', 'account_manager_id', 'inactivity_days', 'count_collabs', 'brand_color', 'status'] as const;

export const planCreate = z.object({ month, copy_from: uuid.optional() });
export const planPatch = z.object({ status: z.enum(['draft', 'active', 'closed']).optional(), notes: z.string().nullable().optional() });

export const planItemInput = z.object({
  content_type: z.enum(ALL_CONTENT_TYPES),
  monthly_count: z.number().int().min(0).max(62),
  frequency,
  owner_id: uuid.nullable(),
  posting_time: time,
  label: z.string().nullable().optional(),
  sort: z.number().int().optional(),
});
export const PLAN_ITEM_COLS = ['content_type', 'monthly_count', 'frequency', 'owner_id', 'posting_time', 'label', 'sort'] as const;

export const taskCreate = z.object({
  client_id: uuid,
  content_type: z.enum(ALL_CONTENT_TYPES),
  owner_id: uuid.nullable(),
  stage: z.enum(STAGES).default('to_brief'),
  due_date: date,
  posting_time: time,
  title: z.string().trim().min(1),
  brief: z.string().optional(),
  priority: z.enum(['normal', 'high']).default('normal'),
});

export const taskPatch = z.object({
  title: z.string().trim().min(1).optional(),
  brief: z.string().nullable().optional(),
  stage: z.enum(STAGES).optional(),
  owner_id: uuid.nullable().optional(),
  content_type: z.enum(ALL_CONTENT_TYPES).optional(),
  due_date: date.optional(),
  posting_time: time.optional(),
  priority: z.enum(['normal', 'high']).optional(),
  flags: z.array(z.enum(['swapped_type', 'collab', 'deleted', 'late'])).optional(),
});

export const staffCreate = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email().transform((s) => s.toLowerCase()),
  role: z.enum(['admin', 'lead', 'designer', 'editor']),
  title: z.string().nullable().optional(),
  password,
});
export const staffPatch = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().transform((s) => s.toLowerCase()).optional(),
  role: z.enum(['admin', 'lead', 'designer', 'editor']).optional(),
  title: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  password: password.optional(),
  telegram_chat_id: z.union([z.string().regex(/^-?\d{4,20}$/, 'a Telegram chat ID is digits'), z.null()]).optional(),
  reassign_to: uuid.optional(),
});

export const markPosted = z.object({ permalink: z.string().url().nullable().optional() });
export const noteInput = z.object({ text: z.string().trim().min(1).max(4000) });
