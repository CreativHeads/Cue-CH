// Copy guard (developer brief §9.1): no internal tool names in anything sent outside the app.
export const DEFAULT_BANNED = ['windsor', 'windsor.ai', 'supabase', 'vercel', 'openai', 'gpt', 'cron', 'api', 'sync', 'webhook', 'database'];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Banned terms found in text (whole word, case-insensitive). */
export function bannedTermsIn(text: string, extra: string[] = []): string[] {
  const terms = [...new Set([...DEFAULT_BANNED, ...extra.map((t) => t.trim().toLowerCase()).filter(Boolean)])];
  return terms.filter((t) => new RegExp(`(^|[^a-z0-9])${escape(t)}([^a-z0-9]|$)`, 'i').test(text));
}

export class CopyGuardError extends Error {
  constructor(public terms: string[]) { super(`Blocked by copy guard: contains ${terms.map((t) => `"${t}"`).join(', ')}`); }
}

/** Throws CopyGuardError if text contains a banned term. Run on every outbound message. */
export function assertClientSafe(text: string, extra: string[] = []) {
  const hits = bannedTermsIn(text, extra);
  if (hits.length) throw new CopyGuardError(hits);
}
