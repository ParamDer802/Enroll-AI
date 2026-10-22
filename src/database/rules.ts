import { db, log, now } from './db';
import type { SessionRules } from '../types';

export const SHEET_RULE =
  'Hold the sheet below the face with both hands. Keep the full sheet visible and do not cover the face.';
export const defaultRules: SessionRules = { requireSheet: false, instructions: '' };
export function normalizeRules(rules?: SessionRules): SessionRules {
  const instructions = (rules?.instructions || '').trim();
  if (instructions.length > 600 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(instructions))
    throw new Error(
      'Session instructions must be at most 600 characters without control characters.',
    );
  return { requireSheet: !!rules?.requireSheet, instructions };
}
export function needsRuleReview(rules?: SessionRules) {
  return !!(rules?.requireSheet || rules?.instructions.trim());
}
export async function getSessionRules(id: string) {
  const session = await db.sessions.get(id);
  if (!session) throw new Error('Session no longer exists.');
  if (session.status === 'Archived')
    throw new Error('Restore the archived session before capturing.');
  return { rules: normalizeRules(session.rules), revision: session.rulesRevision || 0 };
}
export async function updateSessionRules(
  id: string,
  rules: SessionRules,
  expectedRevision: number,
) {
  const cleaned = normalizeRules(rules);
  const write = () =>
    db.transaction('rw', [db.sessions, db.logs], async () => {
      const session = await db.sessions.get(id);
      if (!session || session.status === 'Archived')
        throw new Error('Restore the session before editing its rules.');
      if ((session.rulesRevision || 0) !== expectedRevision)
        throw new Error('Rules changed in another tab. Reopen this editor.');
      await db.sessions.update(id, {
        rules: cleaned,
        rulesRevision: expectedRevision + 1,
        updatedAt: now(),
      });
      await log(
        'SESSION_RULES_UPDATED',
        'Session rules updated. Existing photographs keep their original review evidence.',
        id,
      );
    });
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request('enroll-ai-capture', { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('Close the capture station before editing session rules.');
      await write();
    });
  await write();
}
